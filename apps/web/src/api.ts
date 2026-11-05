import type { User } from './types';
const API='/api';
const store={
  access:()=>localStorage.getItem('stockwise_access'), refresh:()=>localStorage.getItem('stockwise_refresh'),
  save:(tokens:{accessToken:string;refreshToken:string})=>{localStorage.setItem('stockwise_access',tokens.accessToken);localStorage.setItem('stockwise_refresh',tokens.refreshToken);},
  clear:()=>{localStorage.removeItem('stockwise_access');localStorage.removeItem('stockwise_refresh');}
};
let refreshing:Promise<boolean>|null=null;
async function tryRefresh(){
  if(!store.refresh())return false;
  if(!refreshing)refreshing=(async()=>{
    try{const res=await fetch(`${API}/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:store.refresh()})});if(!res.ok)throw Error();store.save(await res.json());return true;}
    catch{store.clear();return false;}
    finally{refreshing=null;}
  })();
  return refreshing;
}
export async function request<T>(path:string,options:RequestInit={},retry=true):Promise<T>{
  const headers=new Headers(options.headers);headers.set('Content-Type','application/json');if(store.access())headers.set('Authorization',`Bearer ${store.access()}`);
  let res:Response;
  try{res=await fetch(`${API}${path}`,{...options,headers});}
  catch{throw new Error('Cannot reach the API gateway. Start the backend services.');}
  if(res.status===401&&retry&&path!=='/auth/login'&&path!=='/auth/refresh'&&await tryRefresh())return request<T>(path,options,false);
  if(!res.ok){const body=await res.json().catch(()=>({}));throw new Error(Array.isArray(body.message)?body.message.join(', '):body.message||`Request failed (${res.status})`);}
  return res.json() as Promise<T>;
}
export const api={get:<T>(path:string)=>request<T>(path),post:<T>(path:string,data:any)=>request<T>(path,{method:'POST',body:JSON.stringify(data)}),patch:<T>(path:string,data:any)=>request<T>(path,{method:'PATCH',body:JSON.stringify(data)}),delete:<T>(path:string)=>request<T>(path,{method:'DELETE'})};
export function saveTokens(v:{accessToken:string;refreshToken:string}){store.save(v)}
export function clearTokens(){store.clear()}
export function hasToken(){return !!store.access()||!!store.refresh()}
export async function exportCSV(kind:string){
  const fetchExport=async()=>fetch(`${API}/reports/export?type=${kind}`,{headers:{Authorization:`Bearer ${store.access()}`}});
  let response=await fetchExport();if(response.status===401&&await tryRefresh())response=await fetchExport();
  if(!response.ok)throw new Error('Unable to download report');
  const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download=`inventory-${kind}.csv`;a.click();URL.revokeObjectURL(url);
}
export type LoginResponse={accessToken:string;refreshToken:string;user:User};
