set open=java -Dfile.encoding=gbk -Dloader.path="lib/" -jar webssh.jar
if exist openjdk (
    echo "use open jdk"
    .\openjdk\bin\%open%
) else (
    echo "use local jdk"
    %open%
)
pause