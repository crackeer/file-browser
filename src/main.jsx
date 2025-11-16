import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { setLastRoute } from './store/router'
import { routeTree } from './routeTree.gen'
// Create a new router instance
const router = createRouter({ 
  routeTree, 
})

// Subscribe to the router events
router.subscribe("onLoad", (evt) => {
  setLastRoute(evt.toLocation.pathname);
})

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
     <RouterProvider router={router} />
  </React.StrictMode>,
);
