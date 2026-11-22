#!/bin/sh
# usage: sweep.sh outfile races cap < lines of json
out=$1; races=$2; cap=$3; : > $out
xargs -P 4 -I{} sh -c "timeout 900 node batch.mjs '{}' $races 15 $cap >> $out 2>&1"
sort $out
