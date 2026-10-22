#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
"./程序/runtime/node" "./程序/server.mjs" --launch
if [ "$?" -ne 0 ]; then
  read -r -p "按回车关闭此窗口…"
fi
