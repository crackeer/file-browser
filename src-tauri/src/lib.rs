#[macro_use]
extern crate lazy_static;

mod command;
mod logic;
mod util;
use command::csv::{generate_csv, read_csv};

use command::ssh::{
    disconnect_server, download_remote_file_sync, exist_ssh_session, get_transfer_remote_progress,
    remote_exec_command, remote_list_files, send_cancel_signal, ssh_connect_by_password,
    upload_remote_file, upload_remote_file_sync,
};

use command::upload::{create_upload_task, delete_upload_task, get_upload_task_list};
use logic::upload::crontab;

use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    crontab();
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:storage.db", sqlite_migration())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            ssh_connect_by_password,
            remote_exec_command,
            exist_ssh_session,
            upload_remote_file,
            remote_list_files,
            get_transfer_remote_progress,
            upload_remote_file_sync,
            send_cancel_signal,
            download_remote_file_sync,
            disconnect_server,
            generate_csv,
            read_csv,
            create_upload_task,
            get_upload_task_list,
            delete_upload_task,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn sqlite_migration() -> Vec<Migration> {
    vec![
        // Define your migrations here
        Migration {
            version: 1,
            description: "create ssh server",
            sql: "CREATE TABLE IF NOT EXISTS server (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                server TEXT NOT NULL,
                port TEXT NOT NULL,
                username TEXT NOT NULL,
                password TEXT NOT NULL,
                create_time INTEGER DEFAULT '0'
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create session",
            sql: "CREATE TABLE  IF NOT EXISTS session (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_key TEXT NOT NULL,
                server_id TEXT NOT NULL,
                path TEXT NOT NULL,
                create_time INTEGER DEFAULT '0'
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create command",
            sql: "CREATE TABLE IF NOT EXISTS command (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                command TEXT NOT NULL,
                create_time INTEGER DEFAULT '0'
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add type to session",
            sql: "ALTER TABLE session ADD COLUMN type TEXT DEFAULT 'ssh';",
            kind: MigrationKind::Up,
        },
    ]
}
