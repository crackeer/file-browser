import Database from "@tauri-apps/plugin-sql";
import dayjs from "dayjs";
export const getSQLiteDB = async () => {
    return await Database.load("sqlite:storage.db");
};

export const createStorage = async (name, type, config) => {
    let db = await getSQLiteDB();
    let nowTime = dayjs().unix();
    let configStr = JSON.stringify(config);
    return await db.execute(
        "INSERT into storage_config (name, type, config, create_at) VALUES ($1, $2, $3, $4)",
        [name, type, configStr, nowTime]
    );
};

export const getStorageList = async (storagetType) => {
    let db = await getSQLiteDB();
    let list = await db.select(
        "SELECT * from storage_config WHERE type = $1 order by create_at desc",
        [storagetType]
    );
    for (var i in list) {
        list[i].config = JSON.parse(list[i].config);
        list[i].create_time = dayjs.unix(list[i].create_at).format('YYYY-MM-DD HH:mm')
    }
    return list;
};

export const updateStorage = async (id, config) => {
    let db = await getSQLiteDB();
    let configStr = JSON.stringify(config);
    return await db.execute(
        "update storage_config set config = $1 where id = $3",
        [configStr, id]
    );
}

export const deleteStorage = async (id) => {
    let db = await getSQLiteDB();
    return await db.execute(
        "delete from storage_config where id = $1",
        [id]
    );
}