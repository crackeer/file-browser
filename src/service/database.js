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

export const deleteServer = async (id) => {
    let db = await getSQLiteDB();
    return await db.execute(
        "delete from server where id = $1",
        [id]
    );
}

export const createSession = async (sessionKey, serverId, path) => {
    let db = await getSQLiteDB();
    let nowTime = dayjs().unix();
    return await db.execute(
        "INSERT into session (session_key, server_id, path, create_time) VALUES ($1, $2, $3, $4)",
        [sessionKey, serverId, path, nowTime]
    );  
}

export const getSessionList = async () => {
    let db = await getSQLiteDB();
    let list = await db.select(
        "SELECT * from session order by id desc",
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
    
export const getSessionByKey = async (sessionKey) => {
    let db = await getSQLiteDB();
    let list = await db.select(
        "SELECT * from session where session_key = $1",
        [sessionKey]
    );
    if (list.length == 0) return null;
    return list[0];
}
