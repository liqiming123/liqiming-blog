#!/bin/bash
# Firefly Admin 发布管线：完整构建 → 原子交换站点目录（保留管理台静态）
set -e
export PATH=/opt/firefly-admin/node/bin:$PATH
export COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
LOG=/opt/firefly-admin/logs/build.log
trap 'echo "[$(date "+%F %T")] !!! deploy failed at line $LINENO (exit=$?) — if it is rm Permission denied run: sudo chown -R ubuntu:ubuntu /opt/firefly-admin/blog/.astro /opt/firefly-admin/blog/dist /opt/firefly-admin/blog/node_modules/.astro" >> $LOG' ERR
echo "[$(date '+%F %T')] === build start ===" >> $LOG
cd /opt/firefly-admin/blog
rm -rf .astro   # Astro 内容层缓存：不清会导致已删除文章/说说残留线上
pnpm build >> $LOG 2>&1

SITE=/opt/1panel/www/sites/liqiming-blog
cd $SITE
rm -rf index.new && mkdir index.new
cp -r /opt/firefly-admin/blog/dist/. index.new/
cp -r /opt/firefly-admin/admin/dist index.new/admin
sudo chown -R ubuntu:ubuntu index.new
rm -rf index.old && sudo mv index index.old && sudo mv index.new index && sudo rm -rf index.old
echo "[$(date '+%F %T')] === deployed ===" >> $LOG
