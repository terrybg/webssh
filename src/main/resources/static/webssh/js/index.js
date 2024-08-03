$(function(){
  // $(".modal-open").trigger('click');
  // 头部菜单切换
  $(".top-menu").click(function(){
    changeMenu(".top", $(this).attr("route"));
  });
  // 添加会话tab
  $(".shell-add,.web-add").click(function (){
    let type = 'shell', title = '会话', html = 'ssh.html', icon = 'icon-cloudshellyunminglinghang';
    if ($(this).hasClass("web-add")) {
      type = 'web';
      title = '标签页';
      html = 'web.html';
      icon = 'icon-liulanqi';
    }
    let id = new Date().getTime();
    $(this).parent().before( `
        <li class="nav-item">
            <a class="nav-link ${type}-menu" route="${id}">
                <span class="iconfont ${icon}"></span>
                <span class="remote-tab-title">${title}</span>
                <span class="iconfont icon-shanchu2 m-lg-2 ${type}-remove"></span>
            </a>
        </li>
    `);
    if (type === 'shell') {
      $(`.top-tab-pane[route=remote-${type}]`).append(`
        <div class="tab-pane fade active show shell-tab-pane" route="${id}" style="height: calc(100% - 40px)" style="">
            <div class="leftDiv" style="width: 30%">
                <iframe class="resizable-iframe leftFrame" src="sftp.html"></iframe>
            </div>
            <div class="move-bar"></div>
            <div class="rightDiv" style="width: calc(70% - 10px)">
                <iframe class="resizable-iframe rightFrame"  src="ssh.html"></iframe>
            </div>
        </div>
    `);
    } else {
      $(`.top-tab-pane[route=remote-${type}]`).append(`
        <div className="tab-pane fade active show ${type}-tab-pane" route="${id}" style="height: calc(100% - 42px)">
          <iframe style="height: 100%;width:100%;border: 0px;" src="${html}"></iframe>
        </div>
    `);
    }
    changeMenu(`.${type}`, id);
    //loadSsh();
  });
  // shell 菜单切换
  $(".remote-tabs").on("click", ".shell-menu,.web-menu", function(){
    let type = $(this).hasClass("shell-menu") ? 'shell' : 'web';
    changeMenu('.' + type, $(this).attr("route"));
  });
  // 删除菜单
  $(".remote-tabs").on("click", ".shell-remove,.web-remove", function(){
    let type = $(this).hasClass("shell-remove") ? 'shell' : 'web';
    let route = $(this).parent().attr("route");
    let curentRoute = $(`.${type}-menu.active`).attr("route");
    $(this).parent().parent().remove();
    $(`.shell-tab-pane[route=${route}]`).remove();
    // 如果删除的是当前选中的
    let length = $(`.${type}-tab-pane`).length;
    if (curentRoute == route && length > 0) {
      // 自带定位到最后一个
      let route2 = $($(`.${type}-tab-pane`).get(length - 1)).attr("route");
      changeMenu(`.${type}`, route2);
    }
    return false;
  });
});
function changeTabTitle(type, name){
  let title = type === 'shell' ? '会话' : '标签页';
  $(`.${type}-menu.active .remote-tab-title`).text(`${title}-${name}`);
}
function changeMenu(before, route){
  // 菜单
  $(`${before}-menu`).removeClass("active");
  $(`${before}-menu[route=${route}]`).addClass("active");
  // iframe
  $(`${before}-tab-pane`).removeClass("show").removeClass("active").hide();
  $(`${before}-tab-pane[route=${route}]`).addClass("show").addClass("active").show();
}