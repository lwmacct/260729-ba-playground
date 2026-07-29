# AdsPower Headless 浏览器字体

本文记录在 `192.168.2.13` 上安装的字体包，用于修复 AdsPower headless 浏览器页面中文字乱码、方块字或字形缺失的问题。

## 环境

- 主机：`192.168.2.13`
- 系统：Ubuntu 24.04.4 LTS
- 现象：指纹浏览器页面里的中文显示为乱码、方块或缺失字形。
- 原因：主机上原本只有 DejaVu 字体，缺少 CJK 中文字体。

## 安装命令

在 `192.168.2.13` 上执行：

```bash
apt-get update && \
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  fontconfig \
  fonts-noto-cjk \
  fonts-noto-color-emoji \
  fonts-wqy-microhei \
  fonts-wqy-zenhei \
  fonts-liberation \
  fonts-freefont-ttf && \
fc-cache -f -v
```

本次实际是从 workspace 机器通过 SSH 执行：

```bash
ssh -o BatchMode=yes 192.168.2.13 'apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y fontconfig fonts-noto-cjk fonts-noto-color-emoji fonts-wqy-microhei fonts-wqy-zenhei fonts-liberation fonts-freefont-ttf && fc-cache -f -v'
```

## 验证

检查 CJK 中文字体匹配：

```bash
fc-match "Noto Sans CJK SC"
```

期望结果：

```text
NotoSansCJK-Regular.ttc: "Noto Sans CJK SC" "Regular"
```

可选检查：

```bash
fc-match "Microsoft YaHei"
fc-match sans
```

## 对已启动浏览器生效

已经启动的 AdsPower 浏览器 profile 可能仍然使用旧的字体环境。安装字体后，需要关闭并重新启动受影响的浏览器 profile。

这个改动通常不需要重启 AdsPower 服务本身，但需要重启具体的浏览器 profile 才能让页面重新加载系统字体。

## 下载 SunBrowser 内核

如果启动 profile 时出现类似错误：

```text
SunBrowser 147 is not ready,please to download!
```

说明 AdsPower 要使用的浏览器内核还没有下载到本机。可以通过 AdsPower 本地 API 触发下载。

查看当前内核列表：

```bash
curl -sS 'http://192.168.2.13:50325/api/v2/browser-profile/kernels'
```

触发下载 Chrome 147：

```bash
curl -sS -X POST 'http://192.168.2.13:50325/api/v2/browser-profile/download-kernel' \
  -H 'Content-Type: application/json' \
  --data '{"kernel_type":"Chrome","kernel_version":"147"}'
```

触发下载 Chrome 148：

```bash
curl -sS -X POST 'http://192.168.2.13:50325/api/v2/browser-profile/download-kernel' \
  -H 'Content-Type: application/json' \
  --data '{"kernel_type":"Chrome","kernel_version":"148"}'
```

注意：`kernel_type` 大小写敏感，必须写成 `Chrome`，不能写成 `chrome`。

下载接口成功触发时会返回：

```json
{ "code": 0, "data": { "status": "pending", "progress": 0 } }
```

轮询检查指定版本是否已下载：

```bash
curl -sS 'http://192.168.2.13:50325/api/v2/browser-profile/kernels' | \
node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s); const item=j.data.list.find(x=>x.kernel_type==='Chrome'&&x.kernel==='148'); console.log(JSON.stringify(item));})"
```

期望看到：

```json
{ "kernel_type": "Chrome", "kernel": "148", "is_downloaded": true }
```

也可以在远端机器检查内核目录：

```bash
ssh -o BatchMode=yes 192.168.2.13 \
  'find /root/.config/adspower_global/cwd_global -maxdepth 2 -type d -name "chrome_*" | sort'
```

本次已经下载完成的目录包括：

```text
/root/.config/adspower_global/cwd_global/chrome_146
/root/.config/adspower_global/cwd_global/chrome_147
/root/.config/adspower_global/cwd_global/chrome_148
```
