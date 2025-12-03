import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app";
import { ConfigProvider } from 'antd';
import './global.css'

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfigProvider
      modal={{
        mask: false,
        maskClosable: false,
      }}>
      <App />
      </ConfigProvider>
  </React.StrictMode>,
);
