function copyJdk(){
  name=${1}
  zipName=${2}
  suffix=${3}
  mkdir ${name}_${suffix}
  cp ./${name}/* ./${name}_${suffix} -r
  unzip -d ./${name}_${suffix} ${zipName}
}

function zipJdk(){
  name=${1}
  suffix=${2}
  zip ${name}.zip ${name}/* -r
  zip ${name}_${suffix}.zip ${name}_${suffix}/* -r
}

# 打包
function target(){
  serverFolder=${1}
  jdkZip=${2}
  os=${3}
  echo "复制Windows 客户端服务端..."
  copyJdk $serverFolder $jdkZip $os
  echo "复制h2数据库文件"
  cp ./proxy.mv.db ./$serverFolder
  echo "压缩文件"
  zipJdk $serverFolder $os
  echo "删除临时文件"
  rm -rf ${serverFolder}_${os}
}
target "webssh" "openjdk_win64.zip" "win64"
target "webssh" "openjdk_mac64.zip" "mac64"