package com.terry.webssh.util;


import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.util.function.Consumer;

/**
 * file 工具类
 * @author terry
 * @version 1.0
 * @date 2022/1/11 16:29
 */
@Service
@Slf4j
public class FileUtil {

    public static Consumer<?> consumer = null;

    /**
     * 递归工具
     * @param dir
     */
    public static void recursion(File dir/*, Consumer<?> consumer*/) {
        File[] files = dir.listFiles();   //列出所有的子文件
        for (File file : files) {
            //如果是文件，则输出文件名字
            if (file.isFile()) {
                System.out.println(file.getName());
            } else if (file.isDirectory()) {
                //如果是文件夹，则输出文件夹的名字，并递归遍历该文件夹
                System.out.println("|" + file.getName());
                recursion(file);//递归遍历
            }
        }
    }

    /**
     * 复制文件
     * @param resource
     * @param target
     */
    public void copyFile(File resource, File target) throws Exception {
        // 输入流 --> 从一个目标读取数据
        // 输出流 --> 向一个目标写入数据
        long start = System.currentTimeMillis();
        // 文件输入流并进行缓冲
        FileInputStream inputStream = new FileInputStream(resource);
        BufferedInputStream bufferedInputStream = new BufferedInputStream(inputStream);
        // 文件输出流并进行缓冲
        FileOutputStream outputStream = new FileOutputStream(target);
        BufferedOutputStream bufferedOutputStream = new BufferedOutputStream(outputStream);
        // 缓冲数组
        // 大文件 可将 1024 * 2 改大一些，但是 并不是越大就越快
        byte[] bytes = new byte[1024 * 2];
        int len = 0;
        while ((len = inputStream.read(bytes)) != -1) {
            bufferedOutputStream.write(bytes, 0, len);
        }
        // 刷新输出缓冲流
        bufferedOutputStream.flush();
        //关闭流
        bufferedInputStream.close();
        bufferedOutputStream.close();
        inputStream.close();
        outputStream.close();
        long end = System.currentTimeMillis();
        System.out.println("耗时：" + (end - start) / 1000 + " s");
    }

    /**
     * 获取文本内容
     * @param resource
     * @return String
     */
    public static String getContent(Resource resource) {
        String str;
        StringBuilder sbd = new StringBuilder();
        try (
            InputStreamReader inputStreamReader = new InputStreamReader(resource.getInputStream());
            BufferedReader bufReader = new BufferedReader(inputStreamReader)) {
            while ((str = bufReader.readLine()) != null) {
                sbd.append(str);
            }
            return sbd.toString();
        } catch (IOException ex) {
            ex.printStackTrace();
            return null;
        }
    }
/*
    public static void main(String[] args) throws Exception {
        new FileUtil().copyFolder("D:\\code\\my\\lowcode\\server\\src\\main\\resources\\templates"
                , "D:\\code\\my\\lowcode\\server\\src\\main\\resources\\tpl");
    }*/

    private static void treeBak(File f, int level) {
        // 缩进量
        String preStr = "";
        for (int i = 0; i < level; i++) {
            if (i == level - 1) {
                preStr = preStr + "└─";
            } else {
                // 级别 - 代表这个目下下地子文件夹
                preStr = preStr + "|   ";
            }
        }
        // 返回一个抽象路径名数组，这些路径名表示此抽象路径名所表示目录中地文件
        File[] childs = f.listFiles();
        for (int i = 0; i < childs.length; i++) {
            // 打印子文件的名字
            // 测试此抽象路径名表示地文件能否是一个目录
            if (childs[i].isDirectory()) {
                System.out.println(preStr + childs[i].getName());
                // 假如子目录下还有子目录，递归子目录调用此方法
                treeBak(childs[i], level + 1);
            } else if (childs[i].getName().contains(".md")) {
                System.out.println(preStr + childs[i].getName());
            }
        }
    }


    public static void replaceRenameFile(String root, String replaceName){
        File[] childs = new File(root).listFiles();
        for (File child : childs) {
            String c = child.getParent();
            String name = child.getName().replace(replaceName, "");
            File mm = new File(c + "\\" + name);
            if(child.renameTo(mm)){
                log.info(" 修改成功 {} ", mm.getAbsolutePath());
                // System.out.println("修改成功!");
            } else {
                log.info(" 修改失败 {} ", mm.getAbsolutePath());
            }
        }
    }

    /**
     * MultipartFile 转 File
     *
     * @param multipartFile
     * @throws Exception
     */
    public static File multipartFileToFile(MultipartFile multipartFile) {
        File file = null;
        //判断是否为null
        if (multipartFile.equals("") || multipartFile.getSize() <= 0) {
            return file;
        }
        //MultipartFile转换为File
        InputStream ins = null;
        OutputStream os = null;
        try {
            ins = multipartFile.getInputStream();
            file = new File(multipartFile.getOriginalFilename());
            os = new FileOutputStream(file);
            int bytesRead = 0;
            byte[] buffer = new byte[8192];
            while ((bytesRead = ins.read(buffer, 0, 8192)) != -1) {
                os.write(buffer, 0, bytesRead);
            }
        } catch (IOException e) {
            e.printStackTrace();
        }finally {
            if(os != null){
                try {
                    os.close();
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
            if(ins != null){
                try {
                    ins.close();
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
        }
        return file;
    }


}