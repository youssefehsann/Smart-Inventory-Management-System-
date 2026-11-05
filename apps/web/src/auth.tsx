import React,{createContext,useCallback,useContext,useEffect,useState} from 'react';
import {api,clearTokens,hasToken,saveTokens,type LoginResponse} from './api';
import type { User } from './types';
interface Context {user:User|null;loading:boolean;login:(email:string,password:string)=>Promise<void>;logout:()=>void;reload:()=>Promise<void>}
const AuthContext=createContext<Context|null>(null);
export function AuthProvider({children}:{children:React.ReactNode}){
  const [user,setUser]=useState<User|null>(null);const [loading,setLoading]=useState(true);
  const reload=useCallback(async()=>{try{setUser(await api.get<User>('/auth/me'));}catch{setUser(null);}},[]);
  useEffect(()=>{(async()=>{if(hasToken())await reload();setLoading(false);})();},[reload]);
  const login=async(email:string,password:string)=>{const response=await api.post<LoginResponse>('/auth/login',{email,password});saveTokens(response);setUser(response.user);};
  const logout=()=>{void api.post('/auth/logout',{refreshToken:localStorage.getItem('stockwise_refresh')}).catch(()=>{});clearTokens();setUser(null);};
  return <AuthContext.Provider value={{user,loading,login,logout,reload}}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>{const ctx=useContext(AuthContext);if(!ctx)throw Error('Missing AuthProvider');return ctx;};
