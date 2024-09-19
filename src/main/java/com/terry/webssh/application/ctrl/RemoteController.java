package com.terry.webssh.application.ctrl;

import cn.hutool.core.date.DatePattern;
import cn.hutool.core.date.DateUtil;
import cn.hutool.core.util.IdUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.extra.ssh.JschUtil;
import cn.hutool.extra.ssh.Sftp;
import com.jcraft.jsch.*;
import com.terry.webssh.application.pojo.SSHConnectInfo;
import com.terry.webssh.application.pojo.Server;
import com.terry.webssh.application.pojo.StatusContent;
import com.terry.webssh.application.service.WebSSHService;
import com.terry.webssh.application.pojo.SftpFile;
import lombok.extern.java.Log;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URLDecoder;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

/**
 * (Server)表控制层
 *
 * @author makejava
 * @since 2022-01-23 19:45:07
 */
@RestController
@RequestMapping("/webssh/api")
@CrossOrigin
@Log
public class RemoteController {

    RemoteController(){
        System.out.println("RemoteController...........");
    }

    /**
     * 上传
     * @return 新增结果
     */
    @PostMapping("/upload")
    public StatusContent<String> upload(String path, String tagId, @RequestPart MultipartFile file) {
        Server server = WebSSHService.webLoginMap.get(tagId);;
        SSHConnectInfo cacheSsh = getCacheSsh(server);
        Sftp sftp = cacheSsh.getSftp();
        path = path + "/";
        try {
            if (sftp.upload(path, file.getOriginalFilename(), file.getInputStream())) {
                return StatusContent.ok("操作成功！");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }/* finally {
            IoUtil.close(sftp);
        }*/
        return StatusContent.error("操作失败！");
    }

    /**
     * 下载
     * @return 新增结果
     */
    @GetMapping("/download")
    public void download(@RequestParam("path") String path,@RequestParam("tagId") String tagId, HttpServletResponse response) throws IOException {
        Server server = WebSSHService.webLoginMap.get(tagId);;
        path = URLDecoder.decode(path, "UTF-8");
        // SSHConnectInfo sshConnectInfo = WebSSHService.sshMap.get(uuid);
        SSHConnectInfo sshConnectInfo = getCacheSsh(server);
        // Session session = JschUtil.getSession(server.getIp(), server.getPort(), server.getUserName(), server.getPassword());
        response.setContentType("text/plain;charset=UTF-8");
        response.setHeader("content-disposition", "attachment;fileName=" + path.substring(path.lastIndexOf("/")));
        // Sftp sftp = JschUtil.createSftp(session);
        Sftp sftp = sshConnectInfo.getSftp();
        sftp.download(path, response.getOutputStream());
        // IoUtil.close(sftp);
    }

    /**
     * 查询目录
     * @return 新增结果
     */
    @GetMapping("/ls")
    public StatusContent<List<SftpFile>> ls(@RequestParam("path") String path,@RequestParam("tagId") String tagId) throws IOException, SftpException {
        Server server = WebSSHService.webLoginMap.get(tagId);
        // SSHConnectInfo sshConnectInfo = WebSSHService.sshMap.get(uuid);
        path = URLDecoder.decode(path, "UTF-8");

        SSHConnectInfo sshConnectInfo = getCacheSsh(server);
        Sftp sftp = sshConnectInfo.getSftp();
        if (StrUtil.isEmpty(path)) {
            path = "";
        }
        List<ChannelSftp.LsEntry> lsEntries = sftp.lsEntries(path);
        List<SftpFile> files = new ArrayList<>();
        for (ChannelSftp.LsEntry item : lsEntries) {
            SftpFile sftpFile = new SftpFile();
            sftpFile.setName(item.getFilename());
            sftpFile.setDir(item.getAttrs().isDir());
            sftpFile.setSize(item.getAttrs().getSize());
            sftpFile.setCreateTime(DateUtil.format(new Date(item.getAttrs().getMtimeString()), DatePattern.NORM_DATETIME_PATTERN));
            sftpFile.setModifyTime(DateUtil.format(new Date(item.getAttrs().getAtimeString()), DatePattern.NORM_DATETIME_PATTERN));
            files.add(sftpFile);
        }
        // IoUtil.close(sftp);
        // sftp.download(path, new File);
        return StatusContent.ok("成功！", files);
    }

    public SSHConnectInfo getCacheSsh(Server server){
        SSHConnectInfo sshConnectInfo = WebSSHService.webSshMap.get(server.getIp() + ":" + server.getPort());
        if (sshConnectInfo == null) {
            sshConnectInfo = new SSHConnectInfo();
            WebSSHService.webSshMap.put(server.getIp() + ":" + server.getPort(), sshConnectInfo);
        }
        Session session = sshConnectInfo.getSession();
        if (session == null) {
            session = JschUtil.getSession(server.getIp(), server.getPort(), server.getUserName(), server.getPassword());
            sshConnectInfo.setSession(session);
        }
        Sftp sftp = sshConnectInfo.getSftp();
        if (sftp == null) {
            sftp = JschUtil.createSftp(session);
            sshConnectInfo.setSftp(sftp);
        }
        return sshConnectInfo;
    }

    @PostMapping("/loginSsh")
    public StatusContent<String> loginSsh(@ModelAttribute Server server){
        Session session = null;
        try {
            session = JschUtil.getSession(server.getIp(), server.getPort(), server.getUserName(), server.getPassword());
            String tagId = IdUtil.simpleUUID();
            WebSSHService.webLoginMap.put(tagId, server);

            // 会话共用技术
            SSHConnectInfo sshConnectInfo = new SSHConnectInfo();
            sshConnectInfo.setSession(session);
            WebSSHService.webSshMap.put(server.getIp() + ":" + server.getPort(), sshConnectInfo);

            return StatusContent.ok("登录成功", tagId);
        } catch (Exception e) {
            if (e.getMessage().contains("UnknownHostException")) {
                return StatusContent.error("登录失败，" + server.getIp() + " 主机不通！");
            } else if (e.getMessage().contains("Connection refused")) {
                return StatusContent.error("登录失败，" + server.getIp() + ":" + server.getPort() + " 网络不通！");
            } else if (e.getMessage().contains("Auth fail")) {
                return StatusContent.error("登录失败，密码错误！");
            }
            return StatusContent.error("登录失败，" + e.getMessage());
        }/* finally {
            if (session != null) {
                session.disconnect();
            }
        }*/
    }

    @GetMapping("/checkLogin")
    public StatusContent<String> checkLogin(@RequestParam String tagId){
        Server server = WebSSHService.webLoginMap.get(tagId);
        if (server == null) {
            return StatusContent.error("过期！");
        }
        return StatusContent.ok("成功！");
    }
}

