$(function (){

    // 初始渲染文件列表
    renderFileList('/root');

    // 点击文件夹时触发事件
    $(document).on('click', '.folder', function() {
        var path = $(this).data('path');
        var currentPath = $('#currentPath').val();
        if (path === '..') {
            // 如果点击的是 ".."，则返回上一级目录
            currentPath = currentPath.split('/').slice(0, -1).join('/');
            if (currentPath === '') {
                currentPath = '/'
            }
        } else {
            if (currentPath.slice(-1) === '/') {
                currentPath += path;
            } else {
                currentPath += '/' + path;
            }
        }
        renderFileList(currentPath);
    });
    $(document).on('click', '.bi-download', function() {
        downloadFile($(this.parentElement).data('path'));
    });
})
function reload() {
    renderFileList($('#currentPath').val());
}
function handleKeyPress(event) {
    if (event.key === 'Enter') {
        reload();
    }
}
// 渲染文件列表函数
function renderFileList(path) {
    $('#currentPath').val(path);
    $('#fileList').empty(); // 清空文件列表
    $.ajax({
        url: `${baseUrl}/ls?path=` + encodeURIComponent(path) + '&tagId=' + tagId, // 替换成你的后端 API 地址
        method: 'GET',
        contentType: 'application/json;charset=UTF-8',
        success: function(response) {
            if (path !== '/') {
                $('#fileList').append('<li class="list-group-item folder" data-path=".."><i class="bi bi-folder-fill"></i> ..</li>');
            }
            // 文件夹
            response.result.filter(item => item.dir).forEach(function(item) {
                $('#fileList').append('<li class="list-group-item folder" data-path="' + item.name + '"><i class="bi bi-folder-fill"></i> ' + item.name + '</li>');
            });
            // 文件
            response.result.filter(item => !item.dir).forEach(function(item) {
                $('#fileList').append('<li class="list-group-item" data-path="' + item.name + '"><i class="bi bi-file-earmark-fill"></i> ' + item.name + '<i class="bi bi-download float-right"></i></li>');
            });/*
                response.result.forEach(function(item) {
                    var iconClass = item.includes('.') ? 'bi bi-file-earmark-fill' : 'bi bi-folder-fill';;
                    var listItem = '<li class="list-group-item ' + (item.includes('.') ? '' : 'folder') + '" data-path="' + item + '"><i class="' + iconClass + '"></i> ' + item + '';
                    if (item.includes('.')) {
                        // 如果是文件，则添加下载按钮
                        listItem += '<i class="bi bi-download float-right"></i>';
                    }
                    listItem += '</li>';
                    $('#fileList').append(listItem);
                });*/
        },
        error: function(xhr, status, error) {
            console.error(error);
        }
    });
}
function triggerFile() {
    $('input[type=file]').trigger('click');
}
function uploadFile() {
    //上传文件、图片类型一般以二进制传递
    let formData = new FormData();
    let file = $('input[type=file]')[0].files[0];
    // 向 FormData 中添加新的属性值 append()方法
    formData.append('file', file);
    formData.append('path', $("#currentPath").val());
    $('#load').modal({keyboard: false});
    $('#load').modal("show");

    $('#progressBar').css('width', '0%').attr('aria-valuenow', 0).text('0%');
    var xhr = new XMLHttpRequest();
    $('#uploadMessage').text("上传中...");
    xhr.open('POST', `${baseUrl}/upload?tagId=${tagId}`, true);

    xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
            var percentComplete = (e.loaded / e.total) * 100;
            $('#progressBar').css('width', percentComplete + '%').attr('aria-valuenow', percentComplete).text(percentComplete.toFixed(2) + '%');
            if (percentComplete == 100) {
                $('#uploadMessage').text("上传完成，校验文件中...");
            }
        }
    };

    xhr.onload = function(res) {
        setTimeout(function (){
            $('#load').modal("hide");
        }, 1500);
        // $('.progress').hide();
        // 处理上传完成后的操作
        $('#uploadMessage').text("上传成功！");
        reload();
        // console.log('Upload complete');
    };

    xhr.onerror = function(res) {
        setTimeout(function (){
            $('#load').modal("hide");
        }, 1500);
        $('#uploadMessage').text("上传失败！");
        // 处理上传失败后的操作
        reload();
    };

    xhr.send(formData);
}
function downloadFile(name) {
    var path = $("#currentPath").val() + "/" + name;
    //上传文件、图片类型一般以二进制传递
    window.open(`${baseUrl}/download?path=` + encodeURIComponent(path) + `&tagId=${tagId}`)
}