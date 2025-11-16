import { create } from 'zustand';

export const getLastRoute = () => {
    let lastRoute = localStorage.getItem('lastRoute');
    if (lastRoute) {
        return lastRoute;
    }
    return null;
}

export const setLastRoute = (path) => {
    localStorage.setItem('lastRoute', path);
}