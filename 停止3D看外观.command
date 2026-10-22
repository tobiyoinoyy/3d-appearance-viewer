#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
"./程序/runtime/node" "./程序/server.mjs" --stop
