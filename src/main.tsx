import React from "react";
import ReactDOM from "react-dom/client";
import "antd/dist/reset.css";
import "@lwmacct/260627-antd-workbench/global.css";
import { AppRoot } from "./app/AppRoot";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppRoot />
  </React.StrictMode>,
);
