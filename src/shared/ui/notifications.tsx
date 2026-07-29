import { ColumnWidthOutlined, CopyOutlined, EnterOutlined } from "@ant-design/icons";
import { Button, Space } from "antd";
import { useState } from "react";
import type { ReactNode } from "react";
import type { MessageInstance } from "antd/es/message/interface";
import type { NotificationInstance } from "antd/es/notification/interface";
import styles from "./notifications.module.css";

type ErrorNotificationOptions = {
  copyText?: string;
  description: ReactNode;
  key: string;
  message: ReactNode;
};

type ErrorNotificationServices = {
  message?: MessageInstance;
  notification: NotificationInstance;
};

type ErrorNotificationContentProps = {
  copyText?: string;
  description: ReactNode;
  messageApi?: MessageInstance;
};

function ErrorNotificationContent({
  copyText,
  description,
  messageApi,
}: ErrorNotificationContentProps) {
  const [wrap, setWrap] = useState(true);

  return (
    <>
      <div
        className={styles.description}
        data-wrap={wrap}
      >
        {description}
      </div>
      <Space size={8} className={styles.actions}>
        <Button
          size="small"
          icon={wrap ? <ColumnWidthOutlined /> : <EnterOutlined />}
          onClick={() => setWrap((current) => !current)}
        >
          {wrap ? "不换行" : "换行"}
        </Button>
        {copyText ? (
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={() => {
              void navigator.clipboard.writeText(copyText).then(
                () => {
                  void messageApi?.success("已复制错误详情。");
                },
                () => {
                  void messageApi?.error("复制失败。");
                },
              );
            }}
          >
            复制详情
          </Button>
        ) : null}
      </Space>
    </>
  );
}

export function showErrorNotification(
  services: ErrorNotificationServices,
  { copyText, description, key, message }: ErrorNotificationOptions,
) {
  const { message: messageApi, notification } = services;

  notification.error({
    key,
    message,
    description: (
      <ErrorNotificationContent
        copyText={copyText}
        description={description}
        messageApi={messageApi}
      />
    ),
    placement: "bottomRight",
    pauseOnHover: true,
    showProgress: true,
    duration: 2,
  });
}
