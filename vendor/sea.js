/* Glass tide reel.
   idea after @holooooo (holooooo/webgl-seascape-video); clean-room implementation, no code copied.
   LICENSE.txt — MIT, copyright ypaaaaaaaaaaaaa. */
(function () {
  "use strict";

  var canvas = document.getElementById("canvas");
  var toggle = document.getElementById("toggle");
  var panel = document.getElementById("panel");
  var eps = document.getElementById("eps");
  var styles = document.getElementById("styles");
  var replayBtn = document.getElementById("replay");
  var scrub = document.getElementById("scrub");
  var hint = document.getElementById("hint");

  var gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: false
  });
  if (!gl) {
    if (hint) hint.textContent = "This reel needs WebGL2.";
    throw new Error("WebGL2 is missing");
  }
  var floatExt = gl.getExtension("EXT_color_buffer_float");
  var halfExt = gl.getExtension("EXT_color_buffer_half_float");
  var linearFloat = gl.getExtension("OES_texture_float_linear");

  var VS = [
    "#version 300 es",
    "layout(location=0) in vec2 aPos;",
    "void main(){gl_Position=vec4(aPos,0.0,1.0);}"
  ].join("\n");

  var TONE = [
    "#version 300 es",
    "precision highp float;",
    "uniform sampler2D uTex;",
    "uniform vec2 uRes;",
    "out vec4 fragColor;",
    "void main(){",
    "  vec2 uv=gl_FragCoord.xy/uRes;",
    "  vec3 c=texture(uTex,uv).rgb;",
    "  c=max(c,vec3(0.0));",
    "  c=c/(vec3(1.0)+c*0.42);",
    "  c=pow(c,vec3(0.4545));",
    "  float l=dot(c,vec3(0.299,0.587,0.114));",
    "  c=mix(vec3(l),c,1.16);",
    "  vec2 p=(uv-0.5)*vec2(uRes.x/uRes.y,1.0);",
    "  c*=1.0-smoothstep(0.42,0.92,length(p))*0.16;",
    "  fragColor=vec4(c,1.0);",
    "}"
  ].join("\n");

  var SEA = [
    "#version 300 es",
    "precision highp float;",
    "uniform vec2 uRes;",
    "uniform float uTime;",
    "uniform vec3 uEye;",
    "uniform vec3 uTarget;",
    "uniform float uBuild;",
    "uniform float uDirect;",
    "uniform float uStyle;",
    "out vec4 fragColor;",
    "vec3 sunDir(){return normalize(vec3(-0.42,0.40,-0.82));}",
    "void seaAt(vec2 xz,out float h,out vec2 g){",
    "  h=0.0; g=vec2(0.0);",
    "  vec2 d=vec2(0.78,0.62);",
    "  float A=0.28; float F=0.72;",
    "  for(int i=0;i<4;i++){",
    "    float w=dot(d,xz)*F+uTime*(0.55+float(i)*0.13);",
    "    float s=sin(w); float c=cos(w);",
    "    h+=A*s;",
    "    g+=d*(A*c*F);",
    "    d=vec2(d.x*0.5-d.y*0.8660254,d.x*0.8660254+d.y*0.5);",
    "    F*=1.73; A*=0.48;",
    "  }",
    "}",
    "vec3 skyColor(vec3 rd){",
    "  vec3 L=sunDir();",
    "  float h=clamp(rd.y*0.9+0.08,0.0,1.0);",
    "  vec3 col=mix(vec3(0.99,0.68,0.46),vec3(0.10,0.30,0.60),pow(h,0.55));",
    "  float sun=pow(max(dot(rd,L),0.0),700.0);",
    "  float glow=pow(max(dot(rd,L),0.0),5.5);",
    "  col+=vec3(1.0,0.94,0.8)*sun*2.6;",
    "  col+=vec3(1.0,0.45,0.16)*glow*0.48;",
    "  if(rd.y>0.0){",
    "    vec2 cu=rd.xz/(rd.y+0.22);",
    "    float a=sin(cu.x*1.45+uTime*0.035)*sin(cu.y*1.1+0.7);",
    "    float b=sin(cu.x*2.5-cu.y*1.65+1.5);",
    "    float cl=smoothstep(0.22,0.88,a*0.55+b*0.35+0.46);",
    "    col=mix(col,vec3(1.0,0.97,0.93),cl*0.55*smoothstep(0.0,0.4,rd.y));",
    "  }",
    "  return col;",
    "}",
    "vec3 rayDir(vec2 frag){",
    "  vec2 uv=(frag-0.5*uRes)/uRes.y;",
    "  vec3 f=normalize(uTarget-uEye);",
    "  vec3 upv=vec3(0.0,1.0,0.0);",
    "  vec3 r=cross(f,upv);",
    "  if(dot(r,r)<1e-4) r=cross(f,vec3(1.0,0.0,0.0));",
    "  r=normalize(r);",
    "  vec3 u=cross(r,f);",
    "  return normalize(f*0.95+r*uv.x+u*uv.y);",
    "}",
    "float marchSea(vec3 ro,vec3 rd,out vec3 pos,out vec3 nrm,out float iter){",
    "  iter=0.0;",
    "  if(rd.y>=-0.0008) return -1.0;",
    "  float t=(ro.y-0.02)/(-rd.y);",
    "  t=clamp(t,0.05,64.0);",
    "  float h=0.0; vec2 g=vec2(0.0);",
    "  for(int i=0;i<4;i++){",
    "    iter=float(i+1);",
    "    pos=ro+rd*t;",
    "    seaAt(pos.xz,h,g);",
    "    float gap=pos.y-h;",
    "    float denom=rd.y-dot(g,rd.xz);",
    "    if(denom>-0.05) denom=-0.05;",
    "    float dt=gap/denom;",
    "    t-=clamp(dt,-2.4,2.4);",
    "    if(t<0.02) t=0.02;",
    "    if(abs(gap)<0.028) break;",
    "  }",
    "  pos=ro+rd*t;",
    "  seaAt(pos.xz,h,g);",
    "  float w2=dot(vec2(-0.55,0.83),pos.xz)*7.2+uTime*1.5;",
    "  h+=0.012*sin(w2);",
    "  g+=vec2(-0.55,0.83)*(0.012*cos(w2)*7.2);",
    "  nrm=normalize(vec3(-g.x,1.0,-g.y));",
    "  nrm.xz+=0.04*vec2(sin(pos.x*24.0+uTime*1.3),cos(pos.z*21.0-uTime));",
    "  nrm=normalize(nrm);",
    "  return max(t,0.05);",
    "}",
    "bool sphereHit(vec3 ro,vec3 rd,vec3 c,float rad,out float t,out vec3 n){",
    "  vec3 oc=ro-c; float b=dot(oc,rd);",
    "  float disc=b*b-(dot(oc,oc)-rad*rad);",
    "  if(disc<0.0) return false;",
    "  float s=sqrt(disc); t=-b-s;",
    "  if(t<0.03) t=-b+s;",
    "  if(t<0.03) return false;",
    "  n=normalize(ro+rd*t-c);",
    "  return true;",
    "}",
    "bool ellipHit(vec3 ro,vec3 rd,vec3 c,vec3 rad,out float t,out vec3 n){",
    "  vec3 oro=(ro-c)/rad; vec3 ird=rd/rad;",
    "  float a=dot(ird,ird); float b=dot(oro,ird); float cc=dot(oro,oro)-1.0;",
    "  float disc=b*b-a*cc;",
    "  if(disc<0.0||a<1e-5) return false;",
    "  float s=sqrt(disc); t=(-b-s)/a;",
    "  if(t<0.03) t=(-b+s)/a;",
    "  if(t<0.03) return false;",
    "  n=normalize((oro+ird*t)/rad);",
    "  return true;",
    "}",
    "bool aboveSea(vec3 p){",
    "  float h; vec2 g; seaAt(p.xz,h,g);",
    "  return p.y>h-0.04;",
    "}",
    "vec3 grade(vec3 c){",
    "  c=max(c,vec3(0.0));",
    "  c=min(c,vec3(8.0));",
    "  c=c/(vec3(1.0)+c*0.42);",
    "  c=pow(c,vec3(0.4545));",
    "  float l=dot(c,vec3(0.299,0.587,0.114));",
    "  c=mix(vec3(l),c,1.16);",
    "  vec2 p=(gl_FragCoord.xy/uRes-0.5)*vec2(uRes.x/uRes.y,1.0);",
    "  c*=1.0-smoothstep(0.42,0.92,length(p))*0.16;",
    "  return c;",
    "}",
    "vec3 present(vec3 full,vec3 lit,vec3 mat,vec3 n,float iter){",
    "  if(uBuild>0.84) return full;",
    "  if(uBuild>0.64) return mat;",
    "  if(uBuild>0.42) return lit;",
    "  if(uBuild>0.20) return n*0.5+0.5;",
    "  return mix(vec3(0.04,0.02,0.16),vec3(1.0,0.52,0.14),clamp(iter/5.0,0.0,1.0));",
    "}",
    "vec3 stylize(vec3 col,vec3 n,float ndl,float fres,float foam){",
    "  if(uStyle<-0.5) return col;",
    "  if(uStyle<0.5){",
    "    vec3 q=floor(col*5.0)/5.0;",
    "    float g=step(0.84,fract(gl_FragCoord.x*0.18))+step(0.84,fract(gl_FragCoord.y*0.18));",
    "    return mix(q,q*0.62,clamp(g,0.0,1.0)*0.45);",
    "  }",
    "  if(uStyle<1.5){",
    "    vec3 fn=normalize(floor(n*3.0)+0.5);",
    "    float d=max(dot(fn,sunDir()),0.0);",
    "    vec3 fc=mix(vec3(0.04,0.12,0.16),vec3(0.32,0.74,0.72),floor(d*3.0)/3.0);",
    "    return mix(fc,vec3(0.95,0.96,0.94),step(0.55,foam));",
    "  }",
    "  if(uStyle<2.5){",
    "    float band=floor(ndl*3.0)/3.0;",
    "    vec3 base=mix(vec3(0.03,0.12,0.2),vec3(0.18,0.68,0.72),band);",
    "    base=mix(base,vec3(0.96,0.97,0.95),step(0.72,foam));",
    "    return mix(base,vec3(0.07,0.08,0.1),smoothstep(0.48,0.78,fres));",
    "  }",
    "  if(uStyle<3.5){",
    "    float stroke=sin(gl_FragCoord.x*0.07+gl_FragCoord.y*0.035+n.x*6.0);",
    "    vec3 o=mix(col,col.bgr,0.2);",
    "    return o*(0.78+0.3*stroke);",
    "  }",
    "  float line=smoothstep(0.2,0.85,foam)+smoothstep(0.55,0.9,fres);",
    "  vec3 paper=vec3(0.94,0.90,0.80);",
    "  vec3 wash=vec3(0.52,0.62,0.64);",
    "  vec3 ink=vec3(0.09,0.09,0.11);",
    "  vec3 c=mix(paper,wash,clamp(0.25+ndl*0.5,0.0,1.0));",
    "  return mix(c,ink,clamp(line,0.0,1.0));",
    "}",
    "void main(){",
    "  vec3 ro=uEye;",
    "  vec3 rd=rayDir(gl_FragCoord.xy);",
    "  vec3 L=sunDir();",
    "  float best=1e9; int kind=0;",
    "  vec3 P; vec3 N; float iter=0.0;",
    "  vec3 pW; vec3 nW; float itW; float tW=marchSea(ro,rd,pW,nW,itW);",
    "  if(tW>0.0){best=tW; kind=1; P=pW; N=nW; iter=itW;}",
    "  float t; vec3 n;",
    "  if(sphereHit(ro,rd,vec3(0.95,-0.55,0.35),1.22,t,n)&&t<best&&aboveSea(ro+rd*t)){",
    "    best=t; kind=2; P=ro+rd*t; N=n; iter=2.0;",
    "  }",
    "  if(sphereHit(ro,rd,vec3(-1.55,-0.72,1.55),0.7,t,n)&&t<best&&aboveSea(ro+rd*t)){",
    "    best=t; kind=2; P=ro+rd*t; N=n; iter=3.0;",
    "  }",
    "  if(ellipHit(ro,rd,vec3(-0.28,0.06,-0.15),vec3(0.5,0.1,0.18),t,n)&&t<best){",
    "    best=t; kind=3; P=ro+rd*t; N=n; iter=2.0;",
    "  }",
    "  if(ellipHit(ro,rd,vec3(-0.28,0.42,-0.15),vec3(0.11,0.4,0.2),t,n)&&t<best){",
    "    best=t; kind=4; P=ro+rd*t; N=n; iter=2.0;",
    "  }",
    "  vec3 shown;",
    "  if(kind==0){",
    "    vec3 s=skyColor(rd);",
    "    float ndl=max(dot(rd,L),0.0);",
    "    s=stylize(s,rd,ndl,0.0,0.0);",
    "    shown=present(s,s,s,rd,0.4);",
    "  } else {",
    "    float ndl=max(dot(N,L),0.0);",
    "    float fres=pow(1.0-max(dot(N,-rd),0.0),5.0);",
    "    vec3 H=normalize(L-rd);",
    "    vec3 refl=reflect(rd,N);",
    "    vec3 skyR=refl.y>0.02?skyColor(refl):vec3(0.02,0.06,0.09);",
    "    vec3 lit; vec3 mat; vec3 full; float foam=0.0;",
    "    if(kind==1){",
    "      float facing=pow(max(N.y,0.0),1.4);",
    "      vec3 deep=vec3(0.008,0.045,0.09);",
    "      vec3 shallow=vec3(0.02,0.20,0.26);",
    "      float shore=0.0;",
    "      shore=max(shore,smoothstep(1.7,0.7,length(P.xz-vec2(0.95,0.35))));",
    "      shore=max(shore,smoothstep(0.95,0.28,length(P.xz-vec2(-1.55,1.55))));",
    "      shore=max(shore,smoothstep(0.7,0.2,length(P.xz-vec2(-0.28,-0.15))));",
    "      vec3 water=mix(deep,shallow,facing);",
    "      water=mix(water,vec3(0.12,0.48,0.42),shore*0.55);",
    "      water+=vec3(0.0,0.22,0.18)*pow(ndl,2.0)*0.35;",
    "      lit=water*(0.35+0.9*ndl);",
    "      float spec=pow(max(dot(N,H),0.0),140.0);",
    "      float glint=pow(max(dot(N,H),0.0),28.0);",
    "      mat=mix(water,skyR,clamp(fres*0.94+0.04,0.0,1.0));",
    "      mat+=vec3(1.0,0.97,0.88)*spec*1.7;",
    "      mat+=vec3(1.0,0.78,0.5)*glint*0.07;",
    "      float hgt; vec2 gg; seaAt(P.xz,hgt,gg);",
    "      float crest=smoothstep(0.08,0.2,hgt);",
    "      float steep=smoothstep(0.25,0.8,1.0-N.y);",
    "      foam=clamp(crest*0.75+steep*0.65+shore*0.9,0.0,1.0);",
    "      full=mix(mat,vec3(0.93,0.96,0.97),foam*0.72);",
    "    } else if(kind==2){",
    "      vec3 albedo=mix(vec3(0.26,0.2,0.16),vec3(0.55,0.44,0.34),smoothstep(-0.15,0.8,N.y));",
    "      albedo=mix(albedo,vec3(0.28,0.4,0.26),smoothstep(0.55,0.95,N.y));",
    "      float wet=smoothstep(0.28,-0.02,P.y);",
    "      albedo*=mix(1.0,0.42,wet);",
    "      lit=albedo*(0.2+0.95*ndl);",
    "      mat=mix(lit,skyR,fres*wet*0.4);",
    "      mat+=vec3(0.75,0.7,0.6)*pow(max(dot(N,H),0.0),28.0)*wet*0.55;",
    "      full=mat;",
    "    } else if(kind==3){",
    "      vec3 albedo=vec3(0.45,0.16,0.1);",
    "      lit=albedo*(0.25+0.9*ndl);",
    "      mat=lit+vec3(0.4)*pow(max(dot(N,H),0.0),20.0)*0.3;",
    "      full=mat;",
    "    } else {",
    "      vec3 albedo=vec3(0.95,0.94,0.9);",
    "      lit=albedo*(0.3+0.85*ndl);",
    "      mat=lit;",
    "      full=mat;",
    "    }",
    "    float fog=1.0-exp(-best*0.034);",
    "    vec3 hor=vec3(0.96,0.72,0.55);",
    "    full=mix(full,hor,fog);",
    "    mat=mix(mat,hor,fog*0.35);",
    "    full=stylize(full,N,ndl,fres,foam);",
    "    mat=stylize(mat,N,ndl,fres,foam);",
    "    lit=stylize(lit,N,ndl,fres,foam);",
    "    shown=present(full,lit,mat,N,iter);",
    "  }",
    "  shown=min(shown,vec3(8.0));",
    "  if(uDirect>0.5) shown=grade(shown);",
    "  fragColor=vec4(shown,1.0);",
    "}"
  ].join("\n");

  var WELL = [
    "#version 300 es",
    "precision highp float;",
    "uniform vec2 uRes; uniform float uTime; uniform vec3 uEye; uniform vec3 uTarget;",
    "uniform float uBuild; uniform float uDirect;",
    "out vec4 fragColor;",
    "float hash31(vec3 p){",
    "  p=fract(p*0.1031);",
    "  p+=dot(p,p.yzx+33.33);",
    "  return fract((p.x+p.y)*p.z);",
    "}",
    "float stars(vec3 rd){",
    "  float s=0.0;",
    "  vec3 p=rd*28.0; vec3 id=floor(p); vec3 f=fract(p)-0.5;",
    "  float h=hash31(id);",
    "  s+=smoothstep(0.06,0.0,length(f))*step(0.68,h);",
    "  p=rd*52.0; id=floor(p); f=fract(p)-0.5; h=hash31(id+4.2);",
    "  s+=smoothstep(0.035,0.0,length(f))*step(0.8,h);",
    "  p=rd*90.0; id=floor(p); f=fract(p)-0.5; h=hash31(id+9.0);",
    "  s+=smoothstep(0.02,0.0,length(f))*step(0.9,h)*h;",
    "  return s;",
    "}",
    "vec3 rayDir(vec2 frag){",
    "  vec2 uv=(frag-0.5*uRes)/uRes.y;",
    "  vec3 f=normalize(uTarget-uEye);",
    "  vec3 r=cross(f,vec3(0.0,1.0,0.0));",
    "  if(dot(r,r)<1e-4) r=vec3(1.0,0.0,0.0);",
    "  r=normalize(r); vec3 u=cross(r,f);",
    "  return normalize(f*0.95+r*uv.x+u*uv.y);",
    "}",
    "vec3 grade(vec3 c){",
    "  c=max(c,vec3(0.0)); c=min(c,vec3(8.0));",
    "  c=c/(vec3(1.0)+c*0.42); c=pow(c,vec3(0.4545));",
    "  float l=dot(c,vec3(0.299,0.587,0.114)); c=mix(vec3(l),c,1.18);",
    "  vec2 p=(gl_FragCoord.xy/uRes-0.5)*vec2(uRes.x/uRes.y,1.0);",
    "  c*=1.0-smoothstep(0.4,0.95,length(p))*0.22;",
    "  return c;",
    "}",
    "void main(){",
    "  vec3 rd0=rayDir(gl_FragCoord.xy);",
    "  vec3 p=uEye; vec3 v=rd0;",
    "  vec3 col=vec3(0.0); float absorb=1.0; bool dead=false; float steps=0.0;",
    "  for(int i=0;i<36;i++){",
    "    steps=float(i+1);",
    "    float r2=dot(p,p); float r=sqrt(r2);",
    "    if(r<0.26){dead=true; break;}",
    "    float advance=clamp(r*0.22,0.05,0.38);",
    "    vec3 acc=-p*(0.85/(r2*r+0.05));",
    "    vec3 v2=normalize(v+acc*advance);",
    "    vec3 p2=p+v2*advance;",
    "    if(p.y*p2.y<0.0){",
    "      float a=p.y/(p.y-p2.y);",
    "      vec3 q=mix(p,p2,clamp(a,0.0,1.0));",
    "      float rad=length(q.xz);",
    "      if(rad>0.4 && rad<2.7){",
    "        float ang=atan(q.z,q.x);",
    "        float spokes=0.62+0.38*sin(ang*4.0+rad*8.0-uTime*1.3);",
    "        float heat=exp(-pow((rad-1.15)/0.42,2.0));",
    "        vec3 hot=mix(vec3(1.0,0.9,0.7),vec3(1.0,0.32,0.06),clamp(rad/2.3,0.0,1.0));",
    "        float dop=0.5+0.5*sin(ang+0.5);",
    "        col+=hot*heat*spokes*(0.4+0.9*dop)*absorb*0.7;",
    "        absorb*=0.5;",
    "      }",
    "    }",
    "    col+=vec3(1.0,0.86,0.6)*exp(-pow((r-0.55)*16.0,2.0))*0.03*absorb;",
    "    p=p2; v=v2;",
    "  }",
    "  vec3 starRd=dead?rd0:v;",
    "  vec3 starsC=vec3(0.8,0.86,1.0)*stars(starRd)*absorb*1.6;",
    "  float band=exp(-pow(starRd.y*2.8,2.0));",
    "  vec3 neb=vec3(0.22,0.26,0.55)*band*0.45*absorb;",
    "  neb+=vec3(0.45,0.2,0.35)*pow(max(sin(atan(starRd.z,starRd.x)*3.0),0.0),4.0)*band*0.2*absorb;",
    "  vec3 full=col+starsC+neb+vec3(0.01,0.012,0.03)*absorb;",
    "  if(dead) full=col*0.2;",
    "  vec3 shown=full;",
    "  if(uBuild<0.2) shown=vec3(steps/36.0,0.12,0.28);",
    "  else if(uBuild<0.42) shown=v*0.5+0.5;",
    "  else if(uBuild<0.66) shown=col+vec3(0.02);",
    "  else if(uBuild<0.84) shown=full*vec3(0.85,0.9,1.0);",
    "  if(uDirect>0.5) shown=grade(shown);",
    "  fragColor=vec4(shown,1.0);",
    "}"
  ].join("\n");

  var VALLEY = [
    "#version 300 es",
    "precision highp float;",
    "uniform vec2 uRes; uniform float uTime; uniform vec3 uEye; uniform vec3 uTarget;",
    "uniform float uBuild; uniform float uDirect;",
    "out vec4 fragColor;",
    "float hash21(vec2 p){",
    "  p=fract(p*vec2(123.34,345.45));",
    "  p+=dot(p,p+34.345);",
    "  return fract(p.x*p.y);",
    "}",
    "float vnoise(vec2 p){",
    "  vec2 i=floor(p); vec2 f=fract(p);",
    "  f=f*f*(3.0-2.0*f);",
    "  float a=hash21(i); float b=hash21(i+vec2(1.0,0.0));",
    "  float c=hash21(i+vec2(0.0,1.0)); float d=hash21(i+vec2(1.0,1.0));",
    "  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);",
    "}",
    "float landH(vec2 p){",
    "  float bend=sin(p.y*0.16)*1.7;",
    "  float river=abs(p.x-bend);",
    "  float bank=smoothstep(0.2,2.6,river);",
    "  float n=vnoise(p*0.15)+0.45*vnoise(p*0.32+3.0);",
    "  n/=1.45;",
    "  float terr=floor(clamp(n,0.0,0.999)*6.0)/6.0;",
    "  return terr*2.7*bank-0.08;",
    "}",
    "vec3 rayDir(vec2 frag){",
    "  vec2 uv=(frag-0.5*uRes)/uRes.y;",
    "  vec3 f=normalize(uTarget-uEye);",
    "  vec3 r=cross(f,vec3(0.0,1.0,0.0));",
    "  if(dot(r,r)<1e-4) r=vec3(1.0,0.0,0.0);",
    "  r=normalize(r); vec3 u=cross(r,f);",
    "  return normalize(f*1.05+r*uv.x+u*uv.y);",
    "}",
    "bool boxHit(vec3 ro,vec3 rd,vec3 mn,vec3 mx,out float t,out vec3 n){",
    "  vec3 srd=vec3(abs(rd.x)<1e-4?(rd.x<0.0?-1e-4:1e-4):rd.x, abs(rd.y)<1e-4?(rd.y<0.0?-1e-4:1e-4):rd.y, abs(rd.z)<1e-4?(rd.z<0.0?-1e-4:1e-4):rd.z);",
    "  vec3 inv=1.0/srd;",
    "  vec3 t0=(mn-ro)*inv; vec3 t1=(mx-ro)*inv;",
    "  vec3 tsm=min(t0,t1); vec3 tbg=max(t0,t1);",
    "  float tn=max(max(tsm.x,tsm.y),tsm.z);",
    "  float tf=min(min(tbg.x,tbg.y),tbg.z);",
    "  if(tf<tn||tf<0.0) return false;",
    "  t=tn>0.02?tn:tf;",
    "  if(t<0.02) return false;",
    "  vec3 q=(ro+rd*t)-(mn+mx)*0.5;",
    "  vec3 a=abs(q)/max(mx-mn,vec3(0.001));",
    "  if(a.x>a.y&&a.x>a.z) n=vec3(sign(q.x),0.0,0.0);",
    "  else if(a.y>a.z) n=vec3(0.0,sign(q.y),0.0);",
    "  else n=vec3(0.0,0.0,sign(q.z));",
    "  return true;",
    "}",
    "float windows(vec3 p,vec3 n,vec3 mn,vec3 mx){",
    "  if(abs(n.y)>0.5) return 0.0;",
    "  vec3 local=(p-mn)/max(mx-mn,vec3(0.001));",
    "  vec2 face=abs(n.x)>0.5?local.zy:local.xy;",
    "  float gx=abs(fract(face.x*3.0)-0.5);",
    "  float gy=abs(fract(face.y*4.0)-0.55);",
    "  return step(0.28,gx)*step(0.22,gy)*step(local.y,0.72)*step(0.18,local.y);",
    "}",
    "vec3 grade(vec3 c){",
    "  c=max(c,vec3(0.0)); c=min(c,vec3(6.0));",
    "  c=c/(vec3(1.0)+c*0.8); c=pow(c,vec3(0.4545));",
    "  float l=dot(c,vec3(0.299,0.587,0.114)); c=mix(vec3(l),c,1.05);",
    "  vec2 p=(gl_FragCoord.xy/uRes-0.5)*vec2(uRes.x/uRes.y,1.0);",
    "  c*=1.0-smoothstep(0.45,1.0,length(p))*0.12;",
    "  return c;",
    "}",
    "void main(){",
    "  vec3 ro=uEye; vec3 rd=rayDir(gl_FragCoord.xy);",
    "  vec3 L=normalize(vec3(0.25,0.86,0.28));",
    "  float best=1e9; int kind=0; vec3 P; vec3 N; float iter=1.0;",
    "  vec3 bmin=vec3(0.0); vec3 bmax=vec3(1.0);",
    "  float t; vec3 n;",
    "  float tLand=-1.0;",
    "  float tt=0.15;",
    "  if(rd.y<0.0) tt=max(0.1,(ro.y-1.4)/(-rd.y));",
    "  for(int i=0;i<12;i++){",
    "    vec3 p=ro+rd*tt;",
    "    float h=landH(p.xz);",
    "    float gap=p.y-h;",
    "    if(gap<0.05){tLand=tt; iter=float(i+1); break;}",
    "    tt+=max(0.05,gap*0.62);",
    "    if(tt>32.0) break;",
    "  }",
    "  if(tLand>0.0){",
    "    best=tLand; kind=1; P=ro+rd*tLand;",
    "    float h=landH(P.xz);",
    "    vec2 e=vec2(0.16,0.0);",
    "    N=normalize(vec3(landH(P.xz-e.xy)-landH(P.xz+e.xy),0.32,landH(P.xz-e.yx)-landH(P.xz+e.yx)));",
    "  }",
    "  if(rd.y<-0.001){",
    "    float tw=(ro.y-0.02)/(-rd.y);",
    "    if(tw>0.05 && tw<best){",
    "      best=tw; kind=2; P=ro+rd*tw; N=vec3(0.0,1.0,0.0); iter=1.0;",
    "    }",
    "  }",
    "  vec3 houses[3];",
    "  houses[0]=vec3(-2.3,0.05,-0.6);",
    "  houses[1]=vec3(2.05,0.08,1.1);",
    "  houses[2]=vec3(-0.35,0.35,-2.8);",
    "  vec3 hsize[3];",
    "  hsize[0]=vec3(0.55,0.62,0.42);",
    "  hsize[1]=vec3(0.48,0.78,0.4);",
    "  hsize[2]=vec3(0.7,0.5,0.5);",
    "  for(int i=0;i<3;i++){",
    "    vec3 c=houses[i]; vec3 s=hsize[i];",
    "    vec3 mn=c-s; vec3 mx=vec3(c.x+s.x,c.y+s.y,c.z+s.z);",
    "    mn.y=c.y; mx.y=c.y+s.y;",
    "    if(boxHit(ro,rd,mn,mx,t,n)&&t<best){best=t; kind=3; P=ro+rd*t; N=n; bmin=mn; bmax=mx; iter=2.0;}",
    "    vec3 rmn=vec3(c.x-s.x-0.08,c.y+s.y,c.z-s.z-0.06);",
    "    vec3 rmx=vec3(c.x+s.x+0.08,c.y+s.y+0.16,c.z+s.z+0.06);",
    "    if(boxHit(ro,rd,rmn,rmx,t,n)&&t<best){best=t; kind=4; P=ro+rd*t; N=n; bmin=rmn; bmax=rmx; iter=2.0;}",
    "  }",
    "  vec3 sky=mix(vec3(0.86,0.84,0.78),vec3(0.50,0.62,0.70),clamp(rd.y*0.9+0.05,0.0,1.0));",
    "  vec3 shown;",
    "  if(kind==0){",
    "    shown=sky;",
    "  } else {",
    "    float ndl=max(dot(N,L),0.0);",
    "    vec3 albedo; vec3 emit=vec3(0.0);",
    "    if(kind==1){",
    "      float terr=floor(clamp(P.y,0.0,2.4)*3.0)/3.0;",
    "      albedo=mix(vec3(0.10,0.30,0.16),vec3(0.46,0.62,0.26),terr);",
    "      albedo=mix(albedo,vec3(0.14,0.18,0.14),clamp(1.0-N.y,0.0,1.0)*0.65);",
    "    } else if(kind==2){",
    "      float rip=0.09;",
    "      vec3 wn=normalize(vec3(sin(P.x*3.6+uTime)*rip,1.0,cos(P.z*3.1-uTime*0.8)*rip));",
    "      vec3 refl=reflect(rd,wn);",
    "      vec3 rc=mix(vec3(0.10,0.24,0.28),sky,smoothstep(-0.1,0.5,refl.y));",
    "      albedo=mix(vec3(0.08,0.22,0.26),rc,0.72);",
    "    } else if(kind==3){",
    "      albedo=vec3(0.42,0.28,0.2);",
    "      float w=windows(P,N,bmin,bmax);",
    "      emit=vec3(1.0,0.62,0.28)*w*1.4;",
    "    } else {",
    "      albedo=vec3(0.28,0.16,0.12);",
    "    }",
    "    vec3 lit=albedo*(0.28+0.75*ndl)+emit;",
    "    float fog=1.0-exp(-best*0.03);",
    "    vec3 mist=vec3(0.76,0.80,0.76);",
    "    vec3 full=mix(lit,mist,fog);",
    "    float sx=gl_FragCoord.x*0.55+gl_FragCoord.y;",
    "    float streak=fract(sx*0.012+uTime*0.22);",
    "    float rain=smoothstep(0.0,0.012,streak)*smoothstep(0.045,0.016,streak);",
    "    full=mix(full,vec3(0.9,0.92,0.9),rain*0.07);",
    "    shown=full;",
    "    if(uBuild<0.2) shown=vec3(iter/12.0,0.25,0.2);",
    "    else if(uBuild<0.42) shown=N*0.5+0.5;",
    "    else if(uBuild<0.66) shown=lit;",
    "    else if(uBuild<0.84) shown=mix(lit,full,0.5);",
    "  }",
    "  if(uDirect>0.5) shown=grade(shown);",
    "  fragColor=vec4(shown,1.0);",
    "}"
  ].join("\n");

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh) || "shader";
      console.error(log);
      if (hint) hint.textContent = log.slice(0, 220);
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function link(fsSrc) {
    var vs = compile(gl.VERTEX_SHADER, VS);
    var fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      var log = gl.getProgramInfoLog(p) || "link";
      console.error(log);
      if (hint) hint.textContent = log.slice(0, 220);
      return null;
    }
    return p;
  }

  var vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  var locs = new WeakMap();
  function loc(p, name) {
    var m = locs.get(p);
    if (!m) { m = {}; locs.set(p, m); }
    if (Object.prototype.hasOwnProperty.call(m, name)) return m[name];
    var l = gl.getUniformLocation(p, name);
    m[name] = l;
    return l;
  }
  function u1f(p, name, v) {
    var l = loc(p, name);
    if (l) gl.uniform1f(l, v);
  }
  function u2f(p, name, x, y) {
    var l = loc(p, name);
    if (l) gl.uniform2f(l, x, y);
  }
  function u3f(p, name, x, y, z) {
    var l = loc(p, name);
    if (l) gl.uniform3f(l, x, y, z);
  }

  var fsList = [SEA, SEA, WELL, VALLEY];
  var programs = [null, null, null, null];
  var toneProg = null;
  function getProg(i) {
    if (!programs[i]) programs[i] = link(fsList[i]);
    return programs[i];
  }

  var target = null;
  function destroyTarget(tg) {
    if (!tg) return;
    gl.deleteFramebuffer(tg.fb);
    gl.deleteTexture(tg.tex);
  }
  function makeTarget(w, h) {
    if (!halfExt && !floatExt) return null;
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    var filter = linearFloat ? gl.LINEAR : gl.NEAREST;
    try {
      if (halfExt) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
      }
    } catch (err) {
      gl.deleteTexture(tex);
      return null;
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) {
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
      return null;
    }
    return { tex: tex, fb: fb, w: w, h: h };
  }

  var HOMES = [
    { yaw: 0.22, pitch: 0.12, dist: 6.4, tx: 0.15, ty: 0.08, tz: 0.1 },
    { yaw: 0.28, pitch: 0.16, dist: 6.2, tx: 0.1, ty: 0.12, tz: 0.05 },
    { yaw: 0.7, pitch: 0.28, dist: 6.4, tx: 0.0, ty: 0.0, tz: 0.0 },
    { yaw: 0.05, pitch: 0.38, dist: 6.8, tx: 0.05, ty: 0.45, tz: 0.3 }
  ];
  var cam = {
    yaw: HOMES[0].yaw, pitch: HOMES[0].pitch, dist: HOMES[0].dist,
    tx: HOMES[0].tx, ty: HOMES[0].ty, tz: HOMES[0].tz
  };
  var home = null;
  var episode = 0;
  var style = 2;
  var mode = "live";
  var build = 1;
  var replayClock = 0;
  var scrubbing = false;
  var grabbing = 0;
  var time = 0;
  var reduce = false;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { reduce = false; }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function angDiff(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function lerpCam(dt) {
    if (!home || grabbing) return;
    var k = 1 - Math.pow(0.04, Math.max(dt, 0.001));
    cam.yaw += angDiff(home.yaw, cam.yaw) * k;
    cam.pitch += (home.pitch - cam.pitch) * k;
    cam.dist += (home.dist - cam.dist) * k;
    cam.tx += (home.tx - cam.tx) * k;
    cam.ty += (home.ty - cam.ty) * k;
    cam.tz += (home.tz - cam.tz) * k;
    if (Math.abs(angDiff(home.yaw, cam.yaw)) < 0.004 && Math.abs(home.dist - cam.dist) < 0.02) home = null;
  }
  function eyeOf() {
    var cp = Math.cos(cam.pitch);
    var sp = Math.sin(cam.pitch);
    return [
      cam.tx + Math.sin(cam.yaw) * cam.dist * cp,
      cam.ty + sp * cam.dist,
      cam.tz + Math.cos(cam.yaw) * cam.dist * cp
    ];
  }

  function markEps() {
    var buttons = eps.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle("on", Number(buttons[i].getAttribute("data-ep")) === episode);
    }
    styles.classList.toggle("show", episode === 1);
  }
  function setEpisode(i) {
    episode = i;
    home = {
      yaw: HOMES[i].yaw, pitch: HOMES[i].pitch, dist: HOMES[i].dist,
      tx: HOMES[i].tx, ty: HOMES[i].ty, tz: HOMES[i].tz
    };
    markEps();
    toneFor(i);
  }
  function setStyle(i) {
    style = i;
    var buttons = styles.querySelectorAll("button");
    for (var k = 0; k < buttons.length; k++) {
      buttons[k].classList.toggle("on", Number(buttons[k].getAttribute("data-style")) === i);
    }
  }

  var ptrs = {};
  var ptrCount = 0;
  var lastPinch = null;
  var lastTap = 0;
  function pinchNow() {
    var list = [];
    for (var k in ptrs) if (ptrs[k]) list.push(ptrs[k]);
    if (list.length < 2) return null;
    var dx = list[0].x - list[1].x;
    var dy = list[0].y - list[1].y;
    return {
      dist: Math.sqrt(dx * dx + dy * dy),
      cx: (list[0].x + list[1].x) * 0.5,
      cy: (list[0].y + list[1].y) * 0.5
    };
  }
  function panBy(px, py) {
    var s = cam.dist * 0.0021;
    var sy = Math.sin(cam.yaw);
    var cy = Math.cos(cam.yaw);
    cam.tx -= cy * px * s;
    cam.tz -= (-sy) * px * s;
    cam.tx += sy * py * s;
    cam.tz += cy * py * s;
    cam.tx = clamp(cam.tx, -8, 8);
    cam.tz = clamp(cam.tz, -8, 8);
  }
  canvas.addEventListener("pointerdown", function (e) {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    ptrCount++;
    grabbing++;
    home = null;
    if (ptrCount >= 2) lastPinch = pinchNow();
    var now = performance.now();
    if (ptrCount === 1) {
      if (now - lastTap < 300) {
        var h = HOMES[episode];
        cam.yaw = h.yaw; cam.pitch = h.pitch; cam.dist = h.dist;
        cam.tx = h.tx; cam.ty = h.ty; cam.tz = h.tz;
        lastTap = 0;
      } else lastTap = now;
    }
  });
  canvas.addEventListener("pointermove", function (e) {
    var prev = ptrs[e.pointerId];
    if (!prev) return;
    var cur = { x: e.clientX, y: e.clientY };
    var dx = cur.x - prev.x;
    var dy = cur.y - prev.y;
    ptrs[e.pointerId] = cur;
    if (ptrCount === 1) {
      cam.yaw -= dx * 0.0075;
      cam.pitch = clamp(cam.pitch + dy * 0.0048, 0.05, 1.05);
    } else if (ptrCount >= 2) {
      var pin = pinchNow();
      if (lastPinch && pin && lastPinch.dist > 8) {
        var scale = pin.dist / lastPinch.dist;
        cam.dist = clamp(cam.dist / scale, 2.8, 22);
        panBy(pin.cx - lastPinch.cx, pin.cy - lastPinch.cy);
      }
      lastPinch = pin;
    }
  });
  function endPtr(e) {
    if (!ptrs[e.pointerId]) return;
    delete ptrs[e.pointerId];
    ptrCount = Math.max(0, ptrCount - 1);
    grabbing = Math.max(0, grabbing - 1);
    lastPinch = ptrCount >= 2 ? pinchNow() : null;
  }
  canvas.addEventListener("pointerup", endPtr);
  canvas.addEventListener("pointercancel", endPtr);
  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.06 : 0.94), 2.8, 22);
  }, { passive: false });
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  function eat(el) {
    if (!el) return;
    ["pointerdown", "pointermove", "pointerup", "touchstart", "touchmove", "touchend", "wheel", "dblclick"].forEach(function (ev) {
      el.addEventListener(ev, function (e) { e.stopPropagation(); });
    });
  }
  eat(toggle);
  eat(panel);
  toggle.addEventListener("click", function (e) {
    e.stopPropagation();
    var on = panel.classList.toggle("open");
    toggle.setAttribute("aria-expanded", on ? "true" : "false");
  });
  eps.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button") : null;
    if (!b) return;
    setEpisode(Number(b.getAttribute("data-ep")) || 0);
  });
  styles.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button") : null;
    if (!b) return;
    setStyle(Number(b.getAttribute("data-style")) || 0);
  });
  replayBtn.addEventListener("click", function () {
    if (mode === "replay") {
      mode = "live";
      build = 1;
      scrub.value = "1000";
      replayBtn.textContent = "Replay build";
      replayBtn.classList.remove("on");
    } else {
      mode = "replay";
      replayClock = 0;
      build = 0;
      scrub.value = "0";
      replayBtn.textContent = "Back to live";
      replayBtn.classList.add("on");
    }
  });
  scrub.addEventListener("pointerdown", function () { scrubbing = true; });
  scrub.addEventListener("pointerup", function () { scrubbing = false; });
  scrub.addEventListener("pointercancel", function () { scrubbing = false; });
  scrub.addEventListener("input", function () {
    mode = "replay";
    build = Number(scrub.value) / 1000;
    replayClock = build;
    replayBtn.textContent = "Back to live";
    replayBtn.classList.add("on");
  });

  var actx = null;
  var filter = null;
  var audioStarted = false;
  function startSea() {
    if (audioStarted) return;
    audioStarted = true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      actx = new AC();
      var n = (actx.sampleRate * 0.25) | 0;
      var buffer = actx.createBuffer(1, n, actx.sampleRate);
      var data = buffer.getChannelData(0);
      var b0 = 0;
      var b1 = 0;
      for (var i = 0; i < n; i++) {
        var white = Math.random() * 2 - 1;
        b0 = 0.995 * b0 + 0.005 * white;
        b1 = 0.96 * b1 + 0.04 * white;
        data[i] = b0 * 0.85 + b1 * 0.22;
      }
      var src = actx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      filter = actx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 460;
      var gain = actx.createGain();
      gain.gain.value = 0.04;
      var lfo = actx.createOscillator();
      lfo.frequency.value = 0.07;
      var lfoGain = actx.createGain();
      lfoGain.gain.value = 0.018;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(actx.destination);
      src.start();
      lfo.start();
    } catch (err) { actx = null; }
  }
  function toneFor(i) {
    if (!filter || !actx) return;
    var f = [460, 500, 150, 340][i] || 460;
    try { filter.frequency.setTargetAtTime(f, actx.currentTime, 0.25); } catch (err) {}
  }

  var bufW = 0;
  var bufH = 0;
  function resize() {
    var w = canvas.clientWidth || 0;
    var h = canvas.clientHeight || 0;
    if (w < 2 || h < 2) return false;
    var ratio = Math.min(window.devicePixelRatio || 1, 1);
    var W = Math.max(2, Math.round(w * ratio));
    var H = Math.max(2, Math.round(h * ratio));
    var cap = 450;
    if (H > cap) { W = Math.max(2, Math.round(W * cap / H)); H = cap; }
    if (W > cap) { H = Math.max(2, Math.round(H * cap / W)); W = cap; }
    if (W !== bufW || H !== bufH) {
      bufW = W;
      bufH = H;
      canvas.width = W;
      canvas.height = H;
    }
    return true;
  }

  function drawScene(prog, eye, direct) {
    gl.useProgram(prog);
    u2f(prog, "uRes", canvas.width, canvas.height);
    u1f(prog, "uTime", time);
    u3f(prog, "uEye", eye[0], eye[1], eye[2]);
    u3f(prog, "uTarget", cam.tx, cam.ty, cam.tz);
    u1f(prog, "uBuild", build);
    u1f(prog, "uDirect", direct);
    u1f(prog, "uStyle", episode === 1 ? style : -1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function drawTone() {
    if (!toneProg) toneProg = link(TONE);
    if (!toneProg || !target) return;
    gl.useProgram(toneProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.tex);
    var sampler = loc(toneProg, "uTex");
    if (sampler) gl.uniform1i(sampler, 0);
    u2f(toneProg, "uRes", canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  var floatTouched = false;
  function touchFloat() {
    if (floatTouched) return;
    floatTouched = true;
    var tg = makeTarget(1, 1);
    if (!tg) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, tg.fb);
    gl.viewport(0, 0, 1, 1);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    destroyTarget(tg);
  }
  function draw() {
    var prog = getProg(episode);
    if (!prog) return false;
    var eye = eyeOf();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    drawScene(prog, eye, 1);
    return true;
  }

  var readySent = false;
  var frames = 0;
  function signalReady() {
    if (readySent) return;
    var box = window.__gbSandbox;
    if (box && typeof box.ready === "function") {
      readySent = true;
      box.ready();
    }
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (reduce) dt *= 0.15;
    time += dt;
    if (mode === "replay" && !scrubbing) {
      replayClock += dt / 9;
      if (replayClock > 1) replayClock -= 1;
      build = replayClock;
      scrub.value = String(Math.round(build * 1000));
    } else if (mode === "live") {
      build = 1;
    }
    lerpCam(dt);
    if (resize()) {
      if (draw()) {
        frames++;
        signalReady();
        if (frames === 2) {
          touchFloat();
          startSea();
        }
      }
    }
    requestAnimationFrame(frame);
  }

  setTimeout(function () { if (hint) hint.classList.add("off"); }, 3800);
  requestAnimationFrame(frame);
})();
