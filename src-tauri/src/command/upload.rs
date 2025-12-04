use crate::logic::upload::{add_upload_task, TaskInfo, get_upload_task, remove_upload_task};
use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskInput {
    user: String,
    password: String,
    host: String,
    port: String,

    local_file: String,
    remote_dir: String,
}

#[tauri::command]
pub async fn create_upload_task(task: TaskInput) -> Result<(), String> {
    let temp = TaskInfo {
        user: task.user,
        password: task.password,
        host: task.host,
        port: task.port,

        local_file: task.local_file,
        remote_dir: task.remote_dir,

        total_size: 0,
        upload_size: 0,
        current_file: String::new(),
        current_file_index: 0,
        total_files: 0,

        status: String::from(""),
        message: String::new(),
        cancel_signal: 0,
    };
    add_upload_task(temp)
}

#[tauri::command]
pub async fn get_upload_task_list() -> Result<Vec<TaskInfo>, String> {
    get_upload_task()
}

#[tauri::command]
pub async fn delete_upload_task(index: usize) -> Result<(), String> {
    remove_upload_task(index)
}
