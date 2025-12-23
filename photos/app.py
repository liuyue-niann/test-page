import os
from datetime import datetime

# 获取当前目录下所有 JPG 文件
files = [f for f in os.listdir('./') if f.lower().endswith('.jpg')]

# 按文件创建时间排序（可选，保证序号有顺序）
files.sort(key=lambda x: os.path.getctime(x))

# 获取当前年份和月份
now = datetime.now()
year = now.year
month = now.month

# 用于避免重名
existing_names = set(os.listdir('./'))

# 重命名
counter = 1
for file in files:
    while True:
        new_name = f"{year}_{month}_{counter}.jpg"
        if new_name not in existing_names:
            break
        counter += 1
    os.rename(file, new_name)
    existing_names.add(new_name)
    counter += 1

print("重命名完成")
