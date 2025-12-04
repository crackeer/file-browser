use crate::logic::upload::{add_upload_task, TaskInfo, get_upload_task, remove_upload_task};

#[tauri::command]
pub async fn create_upload_task(task: TaskInfo) -> Result<(), String> {
    add_upload_task(task)
}

#[tauri::command]
pub async fn get_upload_task_list() -> Result<Vec<TaskInfo>, String> {
    get_upload_task()
}

#[tauri::command]
pub async fn delete_upload_task(index: usize) -> Result<(), String> {
    remove_upload_task(index)
}
