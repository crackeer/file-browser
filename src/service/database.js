import Database from "@tauri-apps/plugin-sql";
import dayjs from "dayjs";
export const getSQLiteDB = async () => {
    return await Database.load("sqlite:storage.db");
};

export const createServer = async (name, server, port, username, password) => {
    let db = await getSQLiteDB();
    let nowTime = dayjs().unix();
    return await db.execute(
        "INSERT into server (name, server, port, username, password, create_time) VALUES ($1, $2, $3, $4, $5, $6 )",
        [name, server, port, username, password, nowTime]
    );
};

export const getServerList = async () => {
    let db = await getSQLiteDB();
    let list = await db.select(
        "SELECT * from server order by create_time desc",
    );
    for (var i in list) {
        list[i].create_time = dayjs.unix(list[i].create_time).format('YYYY-MM-DD HH:mm')
    }
    return list;
};

export const getServerByID = async (id) => {
    let db = await getSQLiteDB();
    let list = await db.select(
        "SELECT * from server where id = $1 order by create_time desc",
        [id]
    );
    if (list.length == 0) return null;

    return list[0]
};

export const deleteServer = async (id) => {
    let db = await getSQLiteDB();
    return await db.execute(
        "delete from server where id = $1",
        [id]
    );
}

export const createSession = async (sessionKey, serverId, path, type = 'ssh') => {
    let db = await getSQLiteDB();
    let nowTime = dayjs().unix();
    return await db.execute(
        "INSERT into session (session_key, server_id, path, type, create_time) VALUES ($1, $2, $3, $4, $5)",
        [sessionKey, serverId, path, type, nowTime]
    );  
}

export const getSessionList = async () => {
    let db = await getSQLiteDB();
    let list = await db.select(
        "SELECT * from session order by id asc",
    );
    for (var i in list) {
        list[i].create_time = dayjs.unix(list[i].create_time).format('YYYY-MM-DD HH:mm')
    }
    return list;
};

export const deleteSession = async (sessionKey) => {
    let db = await getSQLiteDB();
    return await db.execute(
        "delete from session where session_key = $1",
        [sessionKey]
    )
}

export const updateSessionPath = async (sessionKey, path) => {
    let db = await getSQLiteDB();
    return await db.execute(
        "update session set path = $1 where session_key = $2",
        [path, sessionKey]
    )
}
    
export const getSessionByKey = async (sessionKey) => {
    let db = await getSQLiteDB();
    let list = await db.select(
        "SELECT * from session where session_key = $1",
        [sessionKey]
    );
    if (list.length == 0) return null;
    return list[0];
}

export const getServerBySessionKey = async (sessionKey) => {
    let db = await getSQLiteDB();
    let list = await db.select(
        "SELECT * from session where session_key = $1",
        [sessionKey]
    );
    if (list.length == 0) return null;

    let server = await db.select("SELECT * from server where id = $1", [list[0].server_id]);
    if (server.length == 0) return null;
    return server[0];
}

export const createCommand = async (name, category, command) => {
    let db = await getSQLiteDB();
    let nowTime = dayjs().unix();
    return await db.execute(
        "INSERT into command (name, category, command, create_time) VALUES ($1, $2, $3, $4)",
        [name, category, command, nowTime]
    );
}

export const getCommandList = async () => {
    let db = await getSQLiteDB();
    let list = await db.select(
        "SELECT * from command order by create_time desc",
    );
    for (var i in list) {
        list[i].create_time = dayjs.unix(list[i].create_time).format('YYYY-MM-DD HH:mm')
    }
    return list;
}

export const deleteCommand = async (id) => {
    let db = await getSQLiteDB();
    return await db.execute(
        "delete from command where id = $1",
        [id]
    );
}