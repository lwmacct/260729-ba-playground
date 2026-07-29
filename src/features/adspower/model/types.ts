export type AdsPowerApiResponse<T> = {
  code: number;
  data: T;
  msg: string;
};

export type AdsPowerGroupRecord = {
  group_id: string;
  group_name: string;
  remark?: string;
};

export type AdsPowerProfileRecord = {
  category_id?: string;
  created_time?: string;
  fakey?: string;
  fbcc_proxy_acc_id?: string;
  group_id: string;
  group_name?: string;
  ip?: string;
  ip_country?: string;
  ipchecker?: string;
  last_open_time?: string;
  name?: string;
  password?: string;
  platform?: string;
  profile_id: string;
  profile_no?: string;
  remark?: string;
  user_proxy_config?: Record<string, unknown>;
  username?: string;
};

export type AdsPowerProfileListFilters = {
  group_id?: string;
  limit?: number;
  page?: number;
  profile_no?: string;
  sort_order?: "asc" | "desc";
  sort_type?: "profile_no" | "last_open_time" | "created_time";
};

export type AdsPowerProfileListData = {
  limit: number;
  list: AdsPowerProfileRecord[];
  page: number;
};

export type AdsPowerBrowserActiveStatus = "Active" | "Inactive";

export type AdsPowerBrowserActiveData = {
  debug_port?: string;
  status: AdsPowerBrowserActiveStatus;
  webdriver?: string;
  ws?: {
    puppeteer?: string;
    selenium?: string;
  };
};

export type AdsPowerGroupListData = {
  list: AdsPowerGroupRecord[];
  page: number;
  page_size: number;
};

export type AdsPowerProfileInput = {
  category_id?: string;
  cookie?: string;
  fakey?: string;
  fingerprint_config?: Record<string, unknown>;
  group_id?: string;
  ignore_cookie_error?: string;
  name?: string;
  password?: string;
  platform?: string;
  profile_id?: string;
  proxyid?: string;
  remark?: string;
  tabs?: string[];
  user_proxy_config?: Record<string, unknown>;
  username?: string;
};
