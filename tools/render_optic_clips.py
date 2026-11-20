"""Render native QHD teaching films. Requires skia-python and ffmpeg on PATH.

Set OPTIC_FONT (and optionally OPTIC_FONT_BOLD) to a Chinese font off Windows.
Geometry and type are rasterized directly at export resolution, never upscaled.
"""
import math
import os
import subprocess
from functools import lru_cache
from pathlib import Path

import skia as sk

OUT = Path(__file__).resolve().parents[1] / 'media' / 'optics'
W, H, FPS, SECONDS = 2560, 1440, 30, 6
BG, PANEL, GRID, BORDER = '#111c20', '#18282d', '#25373b', '#3e5558'
WHITE, MUTED, MINT, AMBER, LILAC = '#f1f6f1', '#b3c6c5', '#79e6d3', '#ffbb79', '#c5a4ff'
REGULAR = os.environ.get('OPTIC_FONT', 'C:/Windows/Fonts/msyh.ttc')
BOLD = os.environ.get('OPTIC_FONT_BOLD', REGULAR if 'OPTIC_FONT' in os.environ else 'C:/Windows/Fonts/msyhbd.ttc')


def color(s, alpha=255):
    return (alpha << 24) | int(s[1:], 16)


@lru_cache(None)
def paint(s, width=0, alpha=255):
    p = sk.Paint(Color=color(s, alpha), AntiAlias=True)
    if width:
        p.setStyle(sk.Paint.kStroke_Style); p.setStrokeWidth(width); p.setStrokeCap(sk.Paint.kRound_Cap)
        p.setStrokeJoin(sk.Paint.kRound_Join)
    return p


@lru_cache(None)
def face(bold):
    f = sk.Typeface.MakeFromFile(BOLD if bold else REGULAR)
    if not f: raise ValueError('Set OPTIC_FONT to a Chinese-capable font file')
    return f


@lru_cache(None)
def font(size, bold):
    f = sk.Font(face(bold), size); f.setSubpixel(True); f.setEdging(sk.Font.Edging.kAntiAlias)
    return f


def text(c,x,y,s,size,ink=WHITE,align='left',bold=False):
    f=font(size,bold); x-=f.measureText(s)*{'left':0,'center':.5,'right':1}[align]
    c.drawSimpleText(s,x,y,f,paint(ink))


def line(c,a,b,ink,width=1,alpha=255):
    c.drawLine(*a,*b,paint(ink,width,alpha))


def disk(c,x,y,r,ink,width=0,alpha=255):
    c.drawCircle(x,y,r,paint(ink,width,alpha))


def path(c,points,ink,width=0,closed=True):
    p=sk.Path();p.moveTo(*points[0]);
    for xy in points[1:]: p.lineTo(*xy)
    if closed:p.close()
    c.drawPath(p,paint(ink,width))


def ray(c,a,b,ink):
    for w,opacity in ((10,12),(5,32),(2.6,202)):line(c,a,b,ink,w,opacity)


def packet(c,a,b,u,ink):
    x,y=(a[i]+(b[i]-a[i])*u for i in (0,1))
    for r,opacity in ((13,20),(8,62),(4.6,255)):disk(c,x,y,r,ink,alpha=opacity)
    disk(c,x,y,2,WHITE)


def ease(u):
    u=max(0,min(1,u));return u*u*(3-2*u)


def radial(x,y,r,deg):
    a=math.radians(deg);return x+r*math.cos(a),y-r*math.sin(a)


def dial(c,x,y,r):
    disk(c,x,y,r+4,'#0f1a1e');disk(c,x,y,r,PANEL);disk(c,x,y,r,BORDER,1.4)
    for deg in range(0,360,5):
        major=deg%30==0;line(c,radial(x,y,r-3,deg),radial(x,y,r-(10 if major else 6),deg),MUTED if major else BORDER,1.3 if major else .9)
    for deg in (0,90):line(c,radial(x,y,r-15,deg),radial(x,y,r-15,deg+180),BORDER,.9)


def axis(c,x,y,r,deg,ink,width=4):
    a=radial(x,y,r,deg+180);b=radial(x,y,r,deg)
    line(c,a,b,ink,width);disk(c,*b,width*.9,ink);disk(c,x,y,3,WHITE)


def header(c,num,title,topic):
    c.clear(color(BG));text(c,44,39,'光学器件图谱',16,MINT,bold=True)
    line(c,(164,33),(207,33),BORDER,1);text(c,222,39,topic,16,MUTED)
    text(c,916,39,f'CHSH   /   {num:02d}',16,MUTED,'right');text(c,42,103,title,45,bold=True)
    c.drawRect(sk.Rect.MakeLTRB(44,127,916,419),paint(PANEL))
    for x in range(68,902,28):
        for y in range(148,412,28):disk(c,x,y,.84,GRID)
    for x,s in [(44,1),(916,-1)]:
        for y,v in [(127,1),(419,-1)]:
            line(c,(x,y),(x+11*s,y),BORDER,1.4);line(c,(x,y),(x,y+11*v),BORDER,1.4)


def footer(c,label,caption,t):
    line(c,(45,451),(45,499),MINT,3);text(c,62,465,label,15,MINT,bold=True)
    text(c,61,500,caption,25,WHITE,bold=True)
    line(c,(44,523),(916,523),BORDER,1.3);line(c,(44,523),(44+872*t/(SECONDS-1/FPS),523),MINT,2)


def pbs(c,t):
    o=(410,244);start=(95,244);straight=(834,244);turned=(410,386)
    # Face seen from the optical plane; the diagonal interface turns s through 90 degrees.
    path(c,[(353,186),(380,163),(494,163),(467,186)],'#47686c')
    path(c,[(467,186),(494,163),(494,278),(467,302)],'#314e56')
    path(c,[(353,186),(467,186),(467,302),(353,302)],'#294149')
    path(c,[(353,186),(467,302),(353,302)],'#304d51')
    line(c,(353,186),(467,302),'#b6d7d3',2.8)
    path(c,[(353,186),(467,186),(467,302),(353,302)],'#92afad',1.25)
    for a,b,col in [(start,o,LILAC),(o,straight,MINT),(o,turned,AMBER)]:ray(c,a,b,col)
    phase=(t%3)/3
    if phase<.5: packet(c,start,o,2*phase,LILAC)
    else:
        for b,col in [(straight,MINT),(turned,AMBER)]:packet(c,o,b,2*phase-1,col)
    text(c,94,214,'入射光',26,LILAC,bold=True);text(c,680,211,'p 分量 · 透射',26,MINT,'center',True)
    text(c,442,374,'s 分量 · 反射',25,AMBER,bold=True)
    return '分束方向','两个正交偏振分量，一个直行，一个转向。'


def bbo(c,t):
    start=(90,267);o=(408,267);a=(836,192);b=(836,342);end=(836,267);event=t>=3
    line(c,o,end,BORDER,1.3);ray(c,start,o,LILAC)
    for dest,col in [(a,MINT),(b,AMBER)]:
        if event:ray(c,o,dest,col)
        else:line(c,o,dest,BORDER,1)
    if not event:ray(c,o,end,LILAC)
    path(c,[(352,211),(394,180),(465,192),(423,225)],'#7a729c')
    path(c,[(352,211),(423,225),(423,327),(352,314)],'#534d72')
    path(c,[(423,225),(465,192),(465,297),(423,327)],'#393a55')
    for left,right in [((352,211),(423,225)),((423,225),(465,192)),((423,225),(423,327))]:line(c,left,right,'#b8a9da',1.5)
    phase=(t%3)/3
    if not event:packet(c,start,end,phase,LILAC)
    elif phase<.5:packet(c,start,o,2*phase,LILAC)
    else:
        for dest,col in [(a,MINT),(b,AMBER)]:packet(c,o,dest,2*phase-1,col)
    text(c,90,232,'405 nm 泵浦',25,LILAC,bold=True);text(c,409,374,'BBO 晶体',23,WHITE,'center')
    if event:
        text(c,832,172,'光子 A',24,MINT,'right',True);text(c,832,380,'光子 B',24,AMBER,'right',True)
    else:text(c,831,245,'直通光',24,LILAC,'right',True)
    return ('偶发下转换','满足条件时，一个泵浦光子转化为一对光子。') if event else ('多数情况','大多数泵浦光子直接通过晶体，不产生光子对。')


def hwp(c,t):
    theta=22.5*ease((t-.8)/3.3)
    for x,title,deg,ink in [(204,'入射线偏振',0,LILAC),(480,'波片快轴',theta,AMBER),(756,'出射线偏振',2*theta,MINT)]:
        text(c,x,167,title,22,ink,'center',True);dial(c,x,265,77)
        if deg>.1:c.drawArc(sk.Rect.MakeLTRB(x-43,222,x+43,308),-deg,deg,False,paint(ink,2))
        axis(c,x,265,61,deg,ink)
        text(c,x,388,(f'{deg:.1f}'.rstrip('0').rstrip('.')+'°'),34,WHITE,'center',True)
    for x in (342,618):line(c,(x-17,265),(x+13,265),MUTED,1.6);path(c,[(x+6,259),(x+14,265),(x+6,271)],MUTED,1.6,False)
    return '角度关系','水平线偏振入射：快轴转 22.5°，出射偏振转 45°。'


def analyzer(c,t):
    deg=45*(ease((t-.45)/1.85)+ease((t-3.25)/1.85));tau=math.cos(math.radians(deg))**2
    x,y=237,274;dial(c,x,y,86);axis(c,x,y,71,0,AMBER,6);axis(c,x,y,59,deg,MINT,3.5)
    text(c,x,164,'透射轴与入射偏振',22,WHITE,'center',True);text(c,x,400,f'夹角  {deg:.0f}°',26,MUTED,'center')
    text(c,490,184,'理想透过率',22,MUTED);text(c,860,190,f'{tau*100:.0f}%',45,MINT,'right',True)
    left,right,top,bottom=494,858,219,350
    def point(a):return left+(right-left)*a/90,bottom-(bottom-top)*math.cos(math.radians(a))**2
    for yy in (top,(top+bottom)/2,bottom):line(c,(left,yy),(right,yy),BORDER,1)
    for mark in (0,45,90):
        xx=point(mark)[0];line(c,(xx,top),(xx,bottom),GRID,1);text(c,xx,384,f'{mark}°',19,MUTED,'center')
    path(c,[point(a) for a in range(91)],'#6a918d',2.5,False)
    path(c,[point(a) for a in range(int(deg)+1)]+[point(deg)],MINT,3.2,False)
    xx,yy=point(deg);line(c,(xx,yy),(xx,bottom),MINT,1,125);disk(c,xx,yy,8,MINT,alpha=55);disk(c,xx,yy,4.3,WHITE)
    return '固定分析轴','从平行转向正交：透过率从 100% 经 50% 降到 0%。'


def render(key,title,topic,num,scene):
    pixels=bytearray(W*H*4)
    info=sk.ImageInfo.Make(W,H,sk.ColorType.kBGRA_8888_ColorType,sk.AlphaType.kPremul_AlphaType)
    surface=sk.Surface.MakeRasterDirect(info,pixels,W*4);c=surface.getCanvas();c.scale(W/960,H/540)
    header(c,num,title,topic);base=bytes(pixels)
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','bgra','-video_size',f'{W}x{H}','-framerate',str(FPS),'-i','-','-an','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-vf','scale=out_color_matrix=bt709','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',str(OUT/f'{key}.mp4')]
    print(f'Rendering {key}…',flush=True)
    with subprocess.Popen(cmd,stdin=subprocess.PIPE) as proc:
        for i in range(FPS*SECONDS):
            pixels[:]=base;t=i/FPS;footer(c,*scene(c,t),t)
            if i==round((3 if key=='analyzer' else 5.35)*FPS):surface.makeImageSnapshot().save(str(OUT/f'{key}.png'))
            proc.stdin.write(pixels)
        proc.stdin.close()
        if proc.wait():raise RuntimeError(f'ffmpeg failed: {key}')


if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    for num,(key,title,topic,scene) in enumerate([('pbs','PBS 偏振分束器','偏振分光',pbs),('bbo','BBO 非线性晶体','光源制备',bbo),('hwp','半波片','偏振旋转',hwp),('analyzer','偏振分析器','偏振投影',analyzer)],1):
        render(key,title,topic,num,scene)
