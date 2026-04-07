# Build Order

任何人（包括AI）不得违规跳步或跨层开发。顺序锁死：

1. 搭建基础地图 + 放置 Entity + 实现 Tick Engine流转
2. 加入 hunger / thirst 数值衰竭模型
3. 完成行动四件套：move / gather / eat / drink 及验证
4. 将产生的流水接到 event log / debug overlay 实现可观测
5. 添加 inventory 限容实现
6. 建造极简 shelter / 生火设施交互
7. 加入 tribe / 开始引入 social memory
8. 实装首个 tech unlock
9. 触发信仰 faith / 诞生首个 priest / 实施 miracle
10. 将以上高层推演接入 LLM reflection / narration 进行黑盒润色
