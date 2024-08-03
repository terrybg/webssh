#!/bin/bash
BASE_PATH=`pwd`
JAR_NAME="${BASE_PATH}/webssh.jar"
LOG_PATh="${BASE_PATH}/webssh.log"
pid=`ps -ef | grep $JAR_NAME | grep -v grep | awk '{print $2}'`
# 先赋权限 chmod -R 777 openjdk_mac64
cd ${BASE_PATH}
start () {
	nohup ./openjdk_mac64/Contents/Home/bin/java -Dloader.path="lib/" -jar $JAR_NAME > $LOG_PATh 2>&1 &
	pid=`ps -ef | grep $JAR_NAME | grep -v grep | awk '{print $2}'`
	echo ""
	echo "Service ${JAR_NAME} is starting??pid=${pid}"
	echo "........................Here is the log.............................."
	echo "....................................................................."
	echo "........................Start successfully??........................."
	tail -200f $LOG_PATh
}
stop () {
	echo "Service ${JAR_NAME} is already running,it's pid = ${pid}"
	kill -9 $pid
	echo "Stop successfully"
}
if [ -z $pid ]; then
	start
else
	stop
	start
fi