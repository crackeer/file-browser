import { invoke as tauriInvoke } from "@tauri-apps/api/core";

const invoke = async (...args) => {
    try {
        console.log('invoke', ...args)
        return await tauriInvoke(...args)
    } catch (e) {
        console.log('invoke exception', e)
        return {error: e.toString()}
    }
}

export const setWindowTitle = async (title) => {
    let result = await invoke("set_window_title", {
        title,
    });
    return result;
};


export const sshListFiles = async (sessionKey, path) => {
    let result = await invoke("remote_list_files", {
        sessionKey,
        path,
    });
    return result;
};

export const downloadRemoteFile = async (sessionKey, localFile, remoteFile) => {
    let result = await invoke("download_remote_file", {
        sessionKey,
        localFile,
        remoteFile,
    });
    return result;
};

export const sshConnectByPassword = async (key, host, port, username, password) => {
    let result = await invoke("exist_ssh_session", {
        sessionKey: key
    })
    console.log('exist_ssh_session', result)
    if (result.error == undefined) {
        return key
    }

    return await invoke("ssh_connect_by_password", {
        host,
        port,
        user: username,
        password,
        key,
    });
};

export const sshDisconnect = async (key) => {
    let result = await invoke("disconnect_server", {
        sessionKey: key
    });
    return result;
}

export const uploadRemoteFile = async (sessionKey, localFile, remoteFile) => {
    let result = await invoke("upload_remote_file", {
        sessionKey,
        localFile,
        remoteFile
    });
    return result;
};

export const uploadRemoteFileSync = async (sessionKey, localFile, remoteFile) => {
    let result = await invoke("upload_remote_file_sync", {
        sessionKey,
        localFile,
        remoteFile
    });
    return result;
};

export const getTransferProgress = async () => {
    let result = await invoke("get_transfer_remote_progress");
    return result;
};

export const cancelFileTransfer = async () => {
    let result = await invoke("send_cancel_signal");
    return result;
}


export const sshExecuteCmd = async (sessionKey, command) => {
    let result = await invoke("remote_exec_command", {
        sessionKey,
        cmdString: command,
    });
    return result;
};


export const deleteRemoteFile = async (sessionKey, file) => {
    console.log('deleteRemoteFile', sessionKey, file)
    let result = await invoke("remote_exec_command", {
        sessionKey,
        cmdString: "rm -rf " + file,
    });
    return result;
};

export const createRemoteDir = async (sessionKey, path) => {
    let result = await invoke("remote_exec_command", {
        sessionKey,
        cmdString: "mkdir -p " + path,
    });
    return result;
};



export const connectFTPServer = async (host, port, username, password) => {
    return await invoke("connect_ftp", {
        host,
        port,
        username,
        password,
    });
};

export const disconnectFTPServer = async (connectKey) => {
    return await invoke("disconnect_ftp", {
        key: connectKey,
    });
};

export const listFTPFiles = async (connectKey, path) => {
    return await invoke("ftp_list", {
        key: connectKey,
        path: path,
    });
};

export const ftpUploadFile = async (connectKey, path, localFile) => {
    return await invoke("ftp_upload_file", {
        key: connectKey,
        path: path,
        localFile: localFile,
    });
};

export const ftpDeleteFile = async (connectKey, path) => {
    return await invoke("ftp_delete_file", {
        key: connectKey,
        path: path,
    });
};

export const ftpDeleteDir = async (connectKey, path) => {
    return await invoke("ftp_delete_dir", {
        key: connectKey,
        path: path,
    });
};
