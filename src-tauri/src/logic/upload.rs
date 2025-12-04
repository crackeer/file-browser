use crate::util::ssh::{connect_ssh_session, AUTH_TYPE_PASSWORD};
use std::sync::{Arc, Mutex};
use std::path::Path;
use std::fs;
use ssh2::Session;
use serde::{Deserialize, Serialize};
use std::io::prelude::*;
use std::io::{BufRead, BufReader};


#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TaskInfo {
    user: String,
    password: String,
    host: String,
    port: String,

    local_file: String,
    is_dir: bool,
    remote_dir: String,
    
    total_size: u64,
    upload_size: u64,
    current_file: String,
    current_file_index: u64,
    total_files: u64,

    status: String,
    message: String,
    cancel_signal : i32,
}

static mut UPLOADING: i32 = 0;

lazy_static! {
    pub static ref UPLOAD_TASK: Arc<Mutex<Vec<TaskInfo>>> = Arc::new(Mutex::new(Vec::new()));
}

pub fn handle_upload_task() -> Result<(), String> {
    if unsafe { UPLOADING } == 1 {
        return Ok(());
    }
    unsafe { UPLOADING = 1 };
    let mut upload_task = UPLOAD_TASK.lock().map_err(|e| e.to_string())?;
    for task in upload_task.iter_mut() {
        if task.status.eq("") {
            task.status = String::from("waiting");
            match handle_task(task) {
                Ok(status) => {
                    task.status = status;
                }
                Err(e) => {
                    task.status = String::from("error");
                    task.message = e;
                }
            }
        }
    }
    unsafe { UPLOADING = 0 };
    Ok(())
}

pub fn add_upload_task(task: TaskInfo) -> Result<(), String> {
    let mut upload_task = UPLOAD_TASK.lock().map_err(|e| e.to_string())?;
    upload_task.push(task);
    tokio::spawn(async {
        _ = handle_upload_task()
    });
    Ok(())
}

pub fn get_upload_task() -> Result<Vec<TaskInfo>, String> {
    let upload_task = UPLOAD_TASK.lock().map_err(|e| e.to_string())?;
    Ok(upload_task.clone())
}

pub fn remove_upload_task(index : usize) -> Result<(), String> {
    let mut upload_task = UPLOAD_TASK.lock().map_err(|e| e.to_string())?;
    if index >= upload_task.len() {
        return Err(format!("index {} is out of range", index));
    }
    if upload_task[index].status.eq("uploading") {
        upload_task[index].cancel_signal = 1;
    } else {
        upload_task.remove(index);
    }
    Ok(())
}

pub fn handle_task(task: &mut TaskInfo) -> Result<String, String> {
    task.status = String::from("calculating");
    let files = list_transfer_files(&task.local_file, &task.remote_dir)?;
    task.total_files = files.len() as u64;
    let session = connect_ssh_session(&task.user, &task.host, &task.port, AUTH_TYPE_PASSWORD, &task.password)?;

    for file in files.iter() {
        task.current_file_index += 1;
        task.upload_size = file.total_size;
        task.current_file = file.local_file.clone();
        task.status = String::from("uploading");

        if let Err(e) = upload_file(&session, file, task) {
            task.status = String::from("error");
            task.message = e;
            break;
        }
        if task.cancel_signal > 0 {
            task.status = String::from("canceled");
            break;
        }
    }
    Ok(String::from("success"))
}

fn upload_file(session: &Session, transfer_info: &TransferFileInfo, task: &mut TaskInfo) -> Result<(), String> {
    let mut remote_channel = session.scp_send(
            Path::new(&transfer_info.remote_file.as_str()),
            0o644,
            transfer_info.total_size,
            None,
        ).map_err(|e| e.to_string())?;
    let tmp_file = fs::File::open(Path::new(&transfer_info.local_file.as_str())).map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(tmp_file); // 创建 BufReader
    loop {
        if task.cancel_signal > 0 {
            break;
        }
        let result = reader.fill_buf();
        if let Err(e) = result {
            return Err(e.to_string());
        }
        let size = result.unwrap().len();
        if size == 0 {
            break;
        }
        _ = remote_channel.write(reader.buffer()).map_err(|e| e.to_string())?;
        reader.consume(size);
        task.upload_size += size as u64;
    }
    remote_channel.send_eof().unwrap();
    remote_channel.wait_eof().unwrap();
    remote_channel.close().unwrap();
    remote_channel.wait_close().unwrap();
    Ok(())
}

struct TransferFileInfo {
    local_file: String,
    total_size: u64,
    current_size: u64,
    remote_file: String,
}

pub fn list_transfer_files(local_dir: &str, remote_dir: &str) -> Result<Vec<TransferFileInfo>, String> {
    let mut files = Vec::new();
    if !std::path::Path::new(local_dir).is_dir() {
        let name = std::path::Path::new(local_dir).file_name().unwrap().to_string_lossy().to_string();
        files.push(TransferFileInfo {
            local_file: local_dir.to_string(),
            total_size: std::fs::metadata(local_dir).map_err(|e| e.to_string())?.len(),
            current_size: 0,
            remote_file: format!("{}/{}", remote_dir, name),
        });
        return Ok(files);
    }
    
    let dir = std::fs::read_dir(local_dir).map_err(|e| e.to_string())?;
    for entry in dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let temp_local_file = path.to_string_lossy().to_string();
        let file_name = entry.file_name().to_string_lossy().to_string();
        let remote_file = format!("{}/{}", remote_dir, file_name);
        if path.is_file() {
            files.push(TransferFileInfo {
                local_file: temp_local_file.clone(),
                total_size: path.metadata().map_err(|e| e.to_string())?.len(),
                current_size: 0,
                remote_file: format!("{}/{}", remote_dir, file_name),
            });
        } else if path.is_dir() {
            let mut temp_files  = list_transfer_files(&temp_local_file, &remote_file)?;
            files.append(&mut temp_files);
        }
    }
    Ok(files)
}
