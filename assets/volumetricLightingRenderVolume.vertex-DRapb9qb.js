import{H5 as e,RR as s,RP as i,SQ as n,SN as a}from"./babylon-CSps3Hcj.js";import"./WVDBReader-LfaVD6Iy.js";const r="volumetricLightingRenderVolumeVertexShader",t=`#include<__decl__sceneVertex>
#include<__decl__meshVertex>
attribute vec3 position;varying vec4 vWorldPos;void main(void) {vec4 worldPos=world*vec4(position,1.0);vWorldPos=worldPos;gl_Position=viewProjection*worldPos;}
`;e.ShadersStore[r]||(e.ShadersStore[r]=t);const c=[s,i,n,a];for(const o of c)e.IncludesShadersStore[o.name]||(e.IncludesShadersStore[o.name]=o.shader);const h={name:r,shader:t};export{h as volumetricLightingRenderVolumeVertexShader};
