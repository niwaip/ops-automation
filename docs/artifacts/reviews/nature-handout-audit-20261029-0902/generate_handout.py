#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from fpdf import FPDF
import os, sys

# 颜色
C_TITLE = (230, 81, 0)
C_BG = (255, 243, 224)
C_BORDER = (255, 183, 77)
C_BG_LIGHT = (255, 228, 196)
C_TEXT = (51, 51, 51)
C_TEXT_L = (120, 120, 120)
C_LEAF_F = (232, 245, 233)
C_LEAF_S = (100, 160, 80)

M = 20
PW = 210
PH = 297
CW = PW - 2*M

class P(FPDF):
    def __init__(s):
        super().__init__('P','mm','A4')
        s.set_auto_page_break(auto=True, margin=25)
        fps = ["/opt/dsh/skills/pdf/assets/NotoSansSC-Regular.otf",
               "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"]
        fp = None
        for f in fps:
            if os.path.exists(f): fp = f; break
        if not fp: print("ERR: no font"); sys.exit(1)
        s.add_font("NS","",fp,uni=True)
        s.set_font("NS","",10)

    def header(s): pass

    def footer(s):
        s.set_y(-15)
        s.set_font("NS","",8)
        s.set_text_color(*C_TEXT_L)
        s.cell(0,10, f'第{s.page_no()}页',align='C')

    def warm_box(s,x,y,w,h,lines,fs=8):
        s.set_fill_color(*C_BG)
        s.set_draw_color(*C_BORDER)
        s.rect(x,y,w,h,'DF')
        s.set_xy(x+4,y+4)
        s.set_font("NS","",fs)
        s.set_text_color(*C_TEXT)
        for ln in lines:
            s.multi_cell(w-8,fs*0.6,ln)

    def leaf(s,cx,cy,sz=22):
        s.set_draw_color(*C_LEAF_S)
        s.set_fill_color(*C_LEAF_F)
        s.ellipse(cx-sz/2,cy-sz*0.7,sz,sz*1.4,'DF')
        s.set_line_width(0.5)
        s.line(cx,cy+sz*0.6,cx,cy+sz*0.9)
        s.set_line_width(0.4)
        s.line(cx,cy-sz*0.4,cx,cy+sz*0.4)
        s.set_line_width(0.3)
        s.line(cx,cy-3,cx+sz*0.3,cy-6)
        s.line(cx,cy+3,cx-sz*0.3,cy-1)
        s.line(cx,cy-7,cx-sz*0.3,cy-9)
        s.line(cx,cy+7,cx+sz*0.3,cy+4)
        s.set_line_width(0.2)

    def table(s,hdrs,rows,x,y,cw):
        ch=10
        s.set_font("NS","B",9)
        s.set_fill_color(*C_BG)
        s.set_draw_color(*C_BORDER)
        s.set_text_color(*C_TITLE)
        cx=x
        for h in hdrs:
            s.set_xy(cx,y)
            s.cell(cw[cw.index(h) if h in hdrs else 0],ch,h,border=1,fill=True,align='C')
            cx+=cw[cw.index(h) if h in hdrs else 0]

        # 重新正确绘制表头
        cx=x
        for i,h in enumerate(hdrs):
            s.set_xy(cx,y)
            s.cell(cw[i],ch,h,border=1,fill=True,align='C')
            cx+=cw[i]

        s.set_font("NS","",8)
        s.set_text_color(*C_TEXT)
        cy=y+ch
        for row in rows:
            cx=x
            mh=ch
            for i,txt in enumerate(row):
                s.set_xy(x,cy)
                tw=s.get_string_width(txt)
                aw=cw[i]-4
                ln=max(1,int(tw/aw)+1) if tw>aw else 1
                rh=max(ch,ln*5.5)
                if rh>mh: mh=rh
            cx=x
            for i,txt in enumerate(row):
                s.set_xy(cx,cy)
                s.cell(cw[i],mh,txt,border=1,align='L')
                cx+=cw[i]
            cy+=mh

    def card(s,x,y,title,content,w=80,h=40):
        s.set_fill_color(*C_BG)
        s.set_draw_color(*C_BORDER)
        s.rect(x,y,w,h,'DF')
        s.set_fill_color(*C_BG_LIGHT)
        s.rect(x,y,w,8,'DF')
        s.set_xy(x+2,y+1.5)
        s.set_font("NS","B",8)
        s.set_text_color(*C_TITLE)
        s.cell(w-4,6,title)
        s.set_xy(x+3,y+10)
        s.set_font("NS","",7)
        s.set_text_color(*C_TEXT_L)
        s.set_draw_color(*C_TEXT_L)
        s.set_line_width(0.3)
        s.rect(x+3,y+11,w-6,h-12)
        s.set_line_width(0.2)
        if content:
            s.set_xy(x+5,y+14)
            s.cell(w-10,6,content,border=0)

def main():
    pdf=P()

    # ====== 第1页 ======
    pdf.add_page()

    # 标题
    pdf.set_font("NS","B",16)
    pdf.set_text_color(*C_TITLE)
    tt="城市自然观察手册"
    pdf.set_xy(M,M)
    pdf.cell(pdf.get_string_width(tt)+10,12,tt)
    pdf.line(M,M+14,M+pdf.get_string_width(tt)+8,M+14)

    pdf.set_font("NS","",9)
    pdf.set_text_color(*C_TEXT_L)
    pdf.set_xy(M+15,M+17)
    pdf.cell(0,8,"观察、记录与分享")

    pdf.set_font("NS","",8)
    pdf.set_xy(PW-M-25,M+17)
    pdf.cell(40,8,"阅读与实践",align='R')

    # 简介
    iy=M+30
    pdf.set_font("NS","B",11)
    pdf.set_text_color(*C_TITLE)
    pdf.set_xy(M,iy)
    pdf.cell(0,8,"欢迎来到自然的世界！")

    pdf.set_font("NS","",9)
    pdf.set_text_color(*C_TEXT)
    pdf.set_xy(M,iy+10)
    pdf.multi_cell(CW,5.5,"城市里也有很多有趣的自然秘密等着你去发现！树叶的颜色、小鸟的歌声、云朵的形状……每一个发现都很有趣！")

    # 温馨提示
    ty=iy+28
    pdf.warm_box(M,ty,CW,20,[
        "温馨观察提示",
        "   • 轻声慢步，不吵到小动物",
        "   • 只观察不伤害，树叶轻轻摸",
        "   • 注意安全，远离马路和深水区"
    ],fs=8)

    # 准备清单
    py=ty+24
    pdf.set_font("NS","B",11)
    pdf.set_text_color(*C_TITLE)
    pdf.set_xy(M,py)
    pdf.cell(0,8,"出发前的准备清单")

    items=["一本笔记本和铅笔","一个放大镜（观察小虫子）",
           "一个收集袋（装落叶，不留活植物）","水杯和帽子",
           "穿上方便活动的运动鞋"]

    pdf.set_font("NS","",9)
    pdf.set_text_color(*C_TEXT)
    ih=6
    for i,it in enumerate(items):
        dy=py+i*ih
        # 圆点
        pdf.set_draw_color(*C_TITLE)
        pdf.set_fill_color(*C_TITLE)
        pdf.set_line_width(1.2)
        pdf.circle(M+2.5,dy+3.5,1.5,'DF')
        pdf.set_line_width(0.2)
        pdf.set_xy(M+8,dy)
        pdf.cell(CW-10,ih,it)

    # 三列表格
    tbx=M
    tby=py+len(items)*ih+10

    pdf.set_font("NS","B",11)
    pdf.set_text_color(*C_TITLE)
    pdf.set_xy(M,tby)
    pdf.cell(0,8,"观察记录表")

    hdrs=["观察对象","可以记录什么","一个小提示"]
    cw=[35,80,55]
    rows=[
        ["树木","树叶形状、树皮颜色、树枝方向","蹲下来看看树皮上的小洞"],
        ["鸟类","羽毛颜色、叫声、飞行姿势","闭上眼睛，只听声音猜鸟"],
        ["天空","云朵形状、颜色变化、太阳位置","找找有没有像动物的云"]
    ]
    pdf.table(hdrs,rows,tbx,tby+10,cw)

    # 叶片图标 - 放在简介旁边
    leaf_cx=M+CW-15
    leaf_cy=iy+12
    pdf.leaf(leaf_cx,leaf_cy,20)

    # ====== 第2页 ======
    pdf.add_page()

    # 标题
    pdf.set_font("NS","B",16)
    pdf.set_text_color(*C_TITLE)
    tt2="记录你的发现"
    pdf.set_xy(M,M)
    pdf.cell(pdf.get_string_width(tt2)+10,12,tt2)
    pdf.line(M,M+14,M+pdf.get_string_width(tt2)+8,M+14)

    pdf.set_font("NS","",9)
    pdf.set_text_color(*C_TEXT_L)
    pdf.set_xy(M+15,M+17)
    pdf.cell(0,8,"观察、记录与分享")

    pdf.set_font("NS","",8)
    pdf.set_xy(PW-M-25,M+17)
    pdf.cell(40,8,"阅读与实践",align='R')

    # 如何写
    ry=M+30
    pdf.set_font("NS","B",11)
    pdf.set_text_color(*C_TITLE)
    pdf.set_xy(M,ry)
    pdf.cell(0,8,"如何写观察记录")

    rtxt=("把看到的、听到的、闻到的都写下来吧！\n"
          "比如：\"今天我看到一棵大树，叶子是绿色的，\n"
          "风一吹就沙沙响。树上有一个鸟窝，里面有\n"
          "三只小鸟。\" 用你自己的话写，越详细越好！")
    pdf.set_xy(M,ry+10)
    pdf.set_font("NS","",9)
    pdf.set_text_color(*C_TEXT)
    pdf.multi_cell(CW,5.5,rtxt)

    # 想一想
    qy=ry+46
    pdf.set_font("NS","B",11)
    pdf.set_text_color(*C_TITLE)
    pdf.set_xy(M,qy)
    pdf.cell(0,8,"想一想")

    qs=["1. 你今天看到的树叶，和其他树叶有什么不一样？",
        "2. 小鸟为什么会在这里安家？",
        "3. 如果明天再来，你觉得会有什么新发现？"]

    pdf.set_font("NS","",9)
    pdf.set_text_color(*C_TEXT)
    qh=6
    for q in qs:
        pdf.set_xy(M+8,qy+10)
        pdf.multi_cell(CW-10,qh,q)

    # 分享建议
    sy=qy+28
    pdf.warm_box(M,sy,CW,18,[
        "交流与分享建议",
        "   • 把你的观察记录画成图画",
        "   • 和同学交换观察日记看",
        "   • 向老师展示你找到的最特别的发现"
    ],fs=8)

    # 记录卡
    cy2=sy+24
    pdf.set_font("NS","B",11)
    pdf.set_text_color(*C_TITLE)
    pdf.set_xy(M,cy2)
    pdf.cell(0,8,"我的观察记录卡")

    cards=[
        ("时间天气","☀ 晴  ☁ 阴  🌧 雨  温度____°C"),
        ("地点","□ 公园  □ 小区  □ 路边  其他：________"),
        ("有趣发现","今天我发现了一个特别的东西……\n\n\n"),
        ("待探索问题","我还想知道……\n\n\n"),
    ]

    cw2=80
    ch2=40
    cg=10

    # 第一行
    for i in range(2):
        x=M+i*(cw2+cg)
        y=cy2+10
        pdf.card(x,y,cards[i][0],cards[i][1],cw2,ch2)

    # 第二行
    for i in range(2):
        x=M+i*(cw2+cg)
        y=cy2+10+ch2+8
        pdf.card(x,y,cards[i+2][0],cards[i+2][1],cw2,ch2)

    # 输出
    out="/workspace/handout.pdf"
    pdf.output(out)
    sz=os.path.getsize(out)
    print(f"PDF 生成成功!")
    print(f"路径: {out}")
    print(f"文件大小: {sz} bytes ({sz/1024:.1f} KB)")
    print(f"页数: {pdf.page_no()}")

if __name__=="__main__":
    main()
