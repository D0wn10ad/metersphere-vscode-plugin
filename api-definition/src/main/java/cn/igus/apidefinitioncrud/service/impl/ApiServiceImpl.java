package cn.igus.apidefinitioncrud.service.impl;

import cn.igus.apidefinitioncrud.service.ApiService;
import org.springframework.stereotype.Service;

import java.util.Random;

/**
 * 接口定义服务层实现类
 */
@Service // 标记为Spring组件，让Spring容器管理
public class ApiServiceImpl implements ApiService {

    // 随机句子数组（可自行扩展）
    private static final String[] RANDOM_SENTENCES = {
            "接口调用成功，今天敲代码效率超高！",
            "CRUD接口写得真规范～",
            "SpringBoot + JDK25 运行丝滑！",
            "随机语录：代码的优雅在于简洁～",
            "接口参数校验通过，完美！"
    };

    @Override
    public String addApi(String apiName, String apiPath, String method) {
        String sentence = getRandomSentence();
        System.out.println("[新增接口] " + sentence); // 控制台打印随机句
        return String.format("新增接口成功！接口名：%s，路径：%s，请求方法：%s，随机语录：%s",
                apiName, apiPath, method, sentence);
    }

    @Override
    public String deleteApi(Long apiId) {
        String sentence = getRandomSentence();
        System.out.println("[删除接口] " + sentence);
        return String.format("删除接口成功！接口ID：%d，随机语录：%s", apiId, sentence);
    }

    @Override
    public String updateApi(Long apiId, String apiName, String apiPath, String method) {
        String sentence = getRandomSentence();
        System.out.println("[修改接口] " + sentence);
        return String.format("修改接口成功！接口ID：%d，新名称：%s，新路径：%s，新方法：%s，随机语录：%s",
                apiId, apiName, apiPath, method, sentence);
    }

    @Override
    public String getApi(Long apiId) {
        String sentence = getRandomSentence();
        System.out.println("[查询接口] " + sentence);
        return String.format("查询接口成功！接口ID：%d，随机语录：%s", apiId, sentence);
    }

    @Override
    public String getRandomSentence() {
        Random random = new Random();
        return RANDOM_SENTENCES[random.nextInt(RANDOM_SENTENCES.length)];
    }
}