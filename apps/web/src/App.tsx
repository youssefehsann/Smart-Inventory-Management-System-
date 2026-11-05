import {Navigate,Route,Routes} from 'react-router-dom';
import {FormEvent,useState} from 'react';
import {ArrowRight,Boxes,Eye,EyeOff,LockKeyhole,ShieldCheck,Sparkles} from 'lucide-react';
import {useAuth} from './auth';
import {Layout} from './Layout';
import {Dashboard} from './pages/Dashboard';
import {Products} from './pages/Products';
import {Inventory} from './pages/Inventory';
import {Alerts,Reports,Settings,Suppliers,Users,Warehouses} from './pages/Operations';
import {Button,Loading} from './ui';
function SignIn(){
 const {login}=useAuth();const [error,setError]=useState(''),[busy,setBusy]=useState(false),[show,setShow]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);
  try{await login(String(f.get('email')),String(f.get('password')));}catch(err){setError((err as Error).message);}finally{setBusy(false);}}
 return <div className="login-screen"><div className="login-left"><div className="login-brand"><div className="brand-mark"><Boxes size={24}/></div><strong>stockwise<span>.</span></strong></div><div className="login-promo"><div className="login-pill"><Sparkles size={15}/> INVENTORY, REIMAGINED</div><h1>Clarity for every product.<br/><em>Confidence in every move.</em></h1><p>A smarter command center for stock, suppliers, warehouses, and every team behind them.</p><div className="login-features"><div><span><ShieldCheck size={20}/></span><strong>Always in control</strong><small>Role-based access and stock movement history</small></div><div><span><Boxes size={20}/></span><strong>Everything connected</strong><small>Unified insight across your locations</small></div></div></div><p className="login-copyright">© {new Date().getFullYear()} Stockwise. Built for teams who move things forward.</p></div><div className="login-right"><div className="login-card"><div className="login-icon"><LockKeyhole size={26}/></div><div className="eyebrow">WELCOME BACK</div><h2>Sign in to Stockwise</h2><p>Enter your credentials to open your workspace.</p><form onSubmit={e=>void submit(e)}><label>Email address<input name="email" required type="email" autoComplete="username" placeholder="you@company.com"/></label><label>Password<div className="password-wrap"><input name="password" required type={show?'text':'password'} autoComplete="current-password" placeholder="Enter your password"/><button type="button" onClick={()=>setShow(!show)} aria-label="Toggle visibility">{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>{error&&<div className="login-error">{error}</div>}<Button disabled={busy} type="submit" className="login-submit">{busy?'Signing in...':'Sign in to workspace'} <ArrowRight size={18}/></Button></form><div className="login-footnote"><ShieldCheck size={16}/> Secure access · Encrypted passwords</div></div></div></div>;
}
export default function App(){const {user,loading}=useAuth();if(loading)return <Loading/>;
 return user?<Routes><Route path="/" element={<Layout/>}><Route index element={<Dashboard/>}/><Route path="products" element={<Products/>}/><Route path="inventory" element={<Inventory/>}/><Route path="warehouses" element={<Warehouses/>}/><Route path="alerts" element={<Alerts/>}/><Route path="suppliers" element={<Suppliers/>}/><Route path="reports" element={<Reports/>}/><Route path="users" element={user.role==='admin'?<Users/>:<Navigate to="/" replace/>}/><Route path="settings" element={<Settings/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Route></Routes>:<SignIn/>;
}
