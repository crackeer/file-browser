#[macro_use]
extern crate lazy_static;

mod command;
use command::ssh::{remote_exec_command, ssh_connect_by_password, upload_remote_file, remote_list_files, exist_ssh_session};
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            remote_list_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn sqlite_migration() -> Vec<Migration> {
    vec![
        // Define your migrations here
        Migration {
            version: 2,
            description: "create_initial_tables",
            sql: "CREATE TABLE  IF NOT EXISTS  storage_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                config TEXT NOT NULL,
                create_at INTEGER DEFAULT '0'
            );",
            kind: MigrationKind::Up,
        },
    ]
}
