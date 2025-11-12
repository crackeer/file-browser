import { get } from 'lodash';
import { create } from 'zustand';

export const useSSHStore = create((set) => ({
    servers: [],
    serverID: 0,
    connectKey: '',
    server: null,
    setConnectKey: (key) => set({ connectKey: key }),
    setServers: (servers) => set({ servers }),
    setServerID: (id) => {
        set({ serverID: id });
        set({ server: get().servers.find((server) => server.id === id) });
    },
    getAllData: () => get(),
}));