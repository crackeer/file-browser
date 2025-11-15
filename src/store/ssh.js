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
        let servers = get().servers;
        if (servers.length > 0) {
            return servers
        }
        servers = await getStorageList('ssh');
        console.log('servers', servers);
        let serverID = servers.length > 0 ? servers[0].id : 0;
        let server = servers.length > 0 ? servers[0] : null;
        set({ servers: servers, serverID: serverID, server: server });

        return servers;
    },
    deleteFile : async (file) => {
        console.log('delete file', file)
    }
}));