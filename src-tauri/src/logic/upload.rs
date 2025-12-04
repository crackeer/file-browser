use crate::util::ssh::{connect_ssh_session, AUTH_TYPE_PASSWORD};
use serde::{Deserialize, Serialize};
use ssh2::Session;
use std::fs;
use std::io::prelude::*;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tokio::time::{self, Duration};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TaskInfo {
    pub user: String,
    pub password: String,
    pub host: String,
    pub port: String,

    pub local_file: String,
    pub remote_dir: String,

    pub total_size: u64,
    pub upload_size: u64,
    pub current_file: String,
    pub current_file_index: u64,
    pub total_files: u64,

    pub status: String,
    pub message: String,
    pub cancel_signal: i32,
}

impl Default for TaskInfo {
    fn default() -> Self {
        Self {
            host: String::from(""),
            port: String::from(""),
            user: String::from(""),
            password: String::from(""),
            local_file: String::from(""),
            remote_dir: String::from(""),
            total_size: 0,
            upload_size: 0,
            current_file: String::from(""),
            current_file_index: 0,
            total_files: 0,
            status: String::from(""),
            message: String::from(""),
            cancel_signal: 0,
        }
    }
}

static mut UPLOADING: i32 = 0;

lazy_static! {
    pub static ref UPLOAD_TASK: Arc<Mutex<Vec<TaskInfo>>> = Arc::new(Mutex::new(Vec::new()));
}

pub fn update_task_info(index: usize, task: TaskInfo) -> Result<(), String> {
    let mut upload_task = UPLOAD_TASK.lock().map_err(|e| e.to_string())?;
    if index >= upload_task.len() {
        return Err(format!("index {} is out of range", index));
    }
    if task.status.len() > 0 {
        upload_task[index].status = task.status;
    }
    if task.message.len() > 0 {
        upload_task[index].message = task.message;
    }
    if task.cancel_signal != 0 {
        upload_task[index].cancel_signal = task.cancel_signal;
    }
    if task.total_size != 0 {
        upload_task[index].total_size = task.total_size;
    }
    if task.upload_size != 0 {
        upload_task[index].upload_size += task.upload_size;
    }
    if task.current_file_index != 0 {
        upload_task[index].current_file_index = task.current_file_index;
    }
    if task.total_files != 0 {
        upload_task[index].total_files = task.total_files;
    }
    if task.current_file.len() > 0 {
        upload_task[index].current_file = task.current_file;
    }
    
    Ok(())
}

pub fn get_cancel_signal(index: usize) -> i32 {
    let upload_task = UPLOAD_TASK.lock().map_err(|e| e.to_string()).unwrap();
    if index >= upload_task.len() {
        return 0
    }
    upload_task[index].cancel_signal
}

pub fn crontab() {
    tokio::spawn(async {
        let mut interval = time::interval(Duration::from_secs(1));
        loop {
            interval.tick().await;
            _ = handle_upload_task();
        }
    });
}

pub fn handle_upload_task() -> Result<(), String> {
    if unsafe { UPLOADING } == 1 {
        return Ok(());
    }
    let pending_tasks: Result<Vec<(usize, TaskInfo)>, String> = {
        let tasks  = UPLOAD_TASK.lock().map_err(|e| e.to_string())?;
        Ok(tasks
            .iter()
            .enumerate()
            .filter(|(_, task)| task.status.is_empty())
            .map(|(idx, task)| (idx, task.clone()))
            .collect())
    };
    let pending_task1 = pending_tasks.map_err(|e| e)?;
    if pending_task1.is_empty() {
        return Ok(());
    }
     for (index, task) in pending_task1 {
        unsafe { UPLOADING =1 };
        tokio::spawn(async move { 
            _ = handle_task(task.clone(), index).map_err(|e| eprintln!("{}", e));
            unsafe { UPLOADING =0 };
        });
        break;
    }
    Ok(())
}

pub fn add_upload_task(task: TaskInfo) -> Result<(), String> {
    let mut upload_task = UPLOAD_TASK.lock().map_err(|e| e.to_string())?;
    upload_task.push(task);
    Ok(())
}

pub fn get_upload_task() -> Result<Vec<TaskInfo>, String> {
    let upload_task = UPLOAD_TASK.lock().map_err(|e| e.to_string())?;
    Ok(upload_task.clone())
}

pub fn remove_upload_task(index: usize) -> Result<(), String> {
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

pub fn handle_task(task: TaskInfo, index: usize) -> Result<String, String> {
    update_task_info(index, TaskInfo {
        status: String::from("calculating"),
        ..TaskInfo::default()
    });
    let files = list_transfer_files(&task.local_file, &task.remote_dir)?;
    update_task_info(index, TaskInfo {
        total_files: files.len() as u64,
        ..TaskInfo::default()
    });
    let session = connect_ssh_session(
        &task.user,
        &task.host,
        &task.port,
        AUTH_TYPE_PASSWORD,
        &task.password,
    )?;

    for file in files.iter() {
        update_task_info(index, TaskInfo {
            current_file_index: task.current_file_index,
            total_files: task.total_files,
            current_file: task.current_file.clone(),
            total_size: task.total_size,
            upload_size: 0,
            status: String::from("uploading"),
            ..TaskInfo::default()
        })?;

        if let Err(e) = upload_file(&session, file, index) {
            update_task_info(index, TaskInfo {
                status: String::from("error"),
                message: e,
                ..TaskInfo::default()
            })?;
            break;
        }
        if get_cancel_signal(index) > 0 {
            update_task_info(index, TaskInfo {
                status: String::from("canceled"),
                ..TaskInfo::default()
            })?;
            break;
        }
    }
    Ok(String::from("success"))
}

fn upload_file(
    session: &Session,
    transfer_info: &TransferFileInfo,
    index: usize,
) -> Result<(), String> {
    let mut remote_channel = session
        .scp_send(
            Path::new(&transfer_info.remote_file.as_str()),
            0o644,
            transfer_info.total_size,
            None,
        )
        .map_err(|e| e.to_string())?;
    let tmp_file =
        fs::File::open(Path::new(&transfer_info.local_file.as_str())).map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(tmp_file); // 创建 BufReader
    loop {
        if get_cancel_signal(index) > 0 {
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
        _ = remote_channel
            .write(reader.buffer())
            .map_err(|e| e.to_string())?;
        reader.consume(size);
        update_task_info(index, TaskInfo {
            upload_size: size as u64,
            ..TaskInfo::default()
        })?;
    }
    remote_channel.send_eof().unwrap();
    remote_channel.wait_eof().unwrap();
    remote_channel.close().unwrap();
    remote_channel.wait_close().unwrap();
    Ok(())
}

pub struct TransferFileInfo {
    local_file: String,
    total_size: u64,
    remote_file: String,
}

pub fn list_transfer_files(
    local_dir: &str,
    remote_dir: &str,
) -> Result<Vec<TransferFileInfo>, String> {
    let mut files = Vec::new();
    if !std::path::Path::new(local_dir).is_dir() {
        let name = std::path::Path::new(local_dir)
            .file_name()
            .unwrap()
            .to_string_lossy()
            .to_string();
        files.push(TransferFileInfo {
            local_file: local_dir.to_string(),
            total_size: std::fs::metadata(local_dir)
                .map_err(|e| e.to_string())?
                .len(),
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
                remote_file: format!("{}/{}", remote_dir, file_name),
            });
        } else if path.is_dir() {
            let mut temp_files = list_transfer_files(&temp_local_file, &remote_file)?;
            files.append(&mut temp_files);
        }
    }
    Ok(files)
}
