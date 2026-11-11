import{H5 as o}from"./babylon-CSps3Hcj.js";import"./WVDBReader-LfaVD6Iy.js";const r="gsSortScanSumsComputeShader",u=`struct GsSortPassParams {count : u32,
numBlocks : u32,
shift : u32,
chunkCount : u32,}
@group(0) @binding(0) var<storage,read> params : GsSortPassParams;@group(0) @binding(1) var<storage,read_write> chunkSums : array<u32>;var<workgroup> sums : array<u32,256>;@compute @workgroup_size(256,1,1)
fn main(@builtin(local_invocation_id) lid : vec3u) {let t=lid.x;let v=select(0u,chunkSums[t],t<params.chunkCount);sums[t]=v;workgroupBarrier();for (var off=1u; off<256u; off=off<<1u) {var add=0u;if (t>=off) {add=sums[t-off];}
workgroupBarrier();sums[t]+=add;workgroupBarrier();}
if (t<params.chunkCount) {chunkSums[t]=sums[t]-v;}}
`;o.ShadersStoreWGSL[r]||(o.ShadersStoreWGSL[r]=u);const t={name:r,shader:u};export{t as gsSortScanSumsComputeShaderWGSL};
