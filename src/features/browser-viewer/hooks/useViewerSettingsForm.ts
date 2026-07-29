import { Form } from "antd";
import { useCallback, useEffect, useRef } from "react";
import {
  defaultCdpViewerSettings,
  readCdpViewerSettings,
  saveCdpViewerSettings,
  type CdpViewerSettings,
} from "../model/settings";
import { normalizeOptionalString } from "../model/target";

type UseViewerSettingsFormOptions = {
  onAutoConnect: () => void;
  onEndpointChange?: (endpoint: string) => void;
  persistSettings: boolean;
};

export function useViewerSettingsForm({
  onAutoConnect,
  onEndpointChange,
  persistSettings,
}: UseViewerSettingsFormOptions) {
  const [form] = Form.useForm<CdpViewerSettings>();
  const autoConnectStartedRef = useRef(false);
  const latestSettingsRef = useRef<CdpViewerSettings>(defaultCdpViewerSettings);
  const onAutoConnectRef = useRef(onAutoConnect);
  const onEndpointChangeRef = useRef(onEndpointChange);
  const watchedAutoApplyCanvasSize = Form.useWatch("autoApplyCanvasSize", form);
  const watchedFollowActiveTarget = Form.useWatch("followActiveTarget", form);
  const displayScale =
    Form.useWatch("displayScale", form) ?? defaultCdpViewerSettings.displayScale;
  const autoApplyCanvasSize =
    typeof watchedAutoApplyCanvasSize === "boolean"
      ? watchedAutoApplyCanvasSize
      : latestSettingsRef.current.autoApplyCanvasSize;
  const followActiveTarget =
    typeof watchedFollowActiveTarget === "boolean"
      ? watchedFollowActiveTarget
      : latestSettingsRef.current.followActiveTarget;

  useEffect(() => {
    onAutoConnectRef.current = onAutoConnect;
  }, [onAutoConnect]);

  useEffect(() => {
    onEndpointChangeRef.current = onEndpointChange;
  }, [onEndpointChange]);

  const publishEndpointChange = useCallback((value: unknown) => {
    const nextEndpoint = normalizeOptionalString(value);
    if (nextEndpoint) {
      onEndpointChangeRef.current?.(nextEndpoint);
    }
  }, []);

  const persistViewerSettings = useCallback(
    (values: CdpViewerSettings) => {
      latestSettingsRef.current = {
        ...defaultCdpViewerSettings,
        ...values,
      };
      publishEndpointChange(latestSettingsRef.current.endpoint);
      if (persistSettings) {
        saveCdpViewerSettings(latestSettingsRef.current);
      }
    },
    [persistSettings, publishEndpointChange],
  );

  const getViewerSettingsValues = useCallback(
    (): CdpViewerSettings => {
      const values = {
        ...defaultCdpViewerSettings,
        ...form.getFieldsValue(true),
      };
      latestSettingsRef.current = values;
      return values;
    },
    [form],
  );

  const validateViewerSettings = useCallback(
    async (options: { requireEndpoint?: boolean } = {}) => {
      await form.validateFields();
      const values = getViewerSettingsValues();
      if (options.requireEndpoint && !normalizeOptionalString(values.endpoint)) {
        throw new Error("CDP endpoint 不能为空。");
      }
      return values;
    },
    [form, getViewerSettingsValues],
  );

  useEffect(() => {
    const settings = persistSettings
      ? readCdpViewerSettings()
      : defaultCdpViewerSettings;
    latestSettingsRef.current = settings;
    form.setFieldsValue(settings);

    if (
      persistSettings &&
      !autoConnectStartedRef.current &&
      normalizeOptionalString(settings.endpoint)
    ) {
      autoConnectStartedRef.current = true;
      window.setTimeout(() => {
        onAutoConnectRef.current();
      }, 0);
    }
  }, [form, persistSettings]);

  return {
    autoApplyCanvasSize,
    displayScale,
    followActiveTarget,
    form,
    getViewerSettingsValues,
    latestSettingsRef,
    persistViewerSettings,
    validateViewerSettings,
  };
}
