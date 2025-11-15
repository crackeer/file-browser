import { create } from 'zustand';
import { getStorageList } from "../service/database";

export const useSSHStore = create((set, get) => ({
    servers: [],
    files: [],
    serverID: 0,
    connectKey: '',
    server: null,
    quickDirs: [],
    currentPath: '',
    setCurrentPath : (path) => set({ currentPath: path }),
    setQuickDirs: (dirs) => set({ quickDirs: dirs }),
    setFiles : (files) => set({ files }),
    setConnectKey: (key) => set({ connectKey: key }),
    setServerID: (id) => {
        set({ serverID: id });
        set({ server: get().servers.find((server) => server.id === id) });
    },
    getServers: async () => {
        console.log('getServers')
        let servers = await getStorageList('ssh');
        let serverID = servers.length > 0 ? servers[0].id : 0;
        let server = servers.length > 0 ? servers[0] : null;
        set({ servers: servers, serverID: serverID, server: server });

        return servers;
    },
    deleteFile : async (file) => {
        console.log('delete file', file)
    }
}));