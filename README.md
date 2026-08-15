# 起势生图

一个可部署到自己服务器的生图网页。用户进入网页后填写 `OPENAI_BASE_URL` 和 `OPENAI_API_KEY`，配置会保存在服务端加密的 `HttpOnly` Cookie 中，默认 90 天有效。

## 功能

- 提示词生成图片
- 参考图上传、拖拽、剪贴板粘贴
- 基于当前结果继续多轮修改
- 浏览器本地保存历史结果和提示词
- 内置常用学术风格提示词
- 生成中的动效反馈
- 手机端适配

## 本地运行

```bash
npm install
npm start
```

打开：

```text
http://localhost:3000
```

第一次进入页面时填写：

- `OPENAI_BASE_URL`
- `OPENAI_API_KEY`

## 阿里服务器部署

建议服务器安装 Node.js 20 或更高版本。

```bash
git clone https://github.com/splzs/chise-image.git
cd chise-image
npm install
SESSION_SECRET="换成一段足够长的随机字符串" npm start
```

生产环境建议使用 `pm2`：

```bash
npm install -g pm2
pm2 start server.js --name qishi-image
pm2 save
```

如果你用 Nginx 配 HTTPS 反代，可以把环境变量加上：

```bash
COOKIE_SECURE=true
SESSION_SECRET="换成一段足够长的随机字符串"
```

`SESSION_SECRET` 用于加密用户保存 90 天的网关配置。不要频繁更换，否则已有登录会失效。



