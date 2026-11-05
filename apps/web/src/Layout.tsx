import {NavLink,Outlet,useLocation} from 'react-router-dom';
import { useState } from 'react';
import {Activity,Bell,Boxes,ChartNoAxesCombined,ChevronDown,ChevronRight,ClipboardList,Command,Layers3,LayoutDashboard,LogOut,Menu,Moon,Search,Settings2,ShieldCheck,Sun,Truck,Users,Warehouse,X} from 'lucide-react';
import {useQuery} from '@tanstack/react-query';
import {api} from './api';
import {useAuth} from './auth';
const nav=[
  {label:'Overview',items:[{to:'/',icon:LayoutDashboard,label:'Dashboard'},{to:'/products',icon:Boxes,label:'Products'},{to:'/inventory',icon:Layers3,label:'Inventory'},{to:'/warehouses',icon:Warehouse,label:'Warehouses'}]},
  {label:'Operations',items:[{to:'/alerts',icon:Bell,label:'Notifications'},{to:'/suppliers',icon:Truck,label:'Suppliers'},{to:'/reports',icon:ChartNoAxesCombined,label:'Analytics'}]},
  {label:'Workspace',items:[{to:'/users',icon:Users,label:'Team members'},{to:'/settings',icon:Settings2,label:'Settings'}]}
];
export function Layout(){
  const {user,logout}=useAuth();const location=useLocation();const [open,setOpen]=useState(false);
  const [dark,setDark]=useState(localStorage.getItem('stockwise_theme')==='dark');
  const {data:unread}=useQuery({queryKey:['unread'],queryFn:()=>api.get<{count:number}>('/alerts/unread-count'),refetchInterval:12000});
  const title=nav.flatMap(n=>n.items).find(n=>n.to===location.pathname)?.label||'Dashboard';
  const toggle=()=>{const next=!dark;setDark(next);localStorage.setItem('stockwise_theme',next?'dark':'light');document.documentElement.classList.toggle('dark',next);};
  return <div className="app-shell">
    {open&&<button className="sidebar-scrim" onClick={()=>setOpen(false)} aria-label="Close navigation"/>}
    <aside className={`sidebar ${open?'sidebar-open':''}`}>
      <div className="brand"><div className="brand-mark"><Layers3 size={22} strokeWidth={2.4}/></div><div><strong>stockwise<span>.</span></strong><small>INVENTORY INTELLIGENCE</small></div><button className="close-mobile" onClick={()=>setOpen(false)}><X size={20}/></button></div>
      <div className="workspace-tile"><div className="workspace-icon"><Command size={18}/></div><div><b>Inventory Workspace</b><span>Operations center</span></div><ChevronDown size={16}/></div>
      <nav className="sidebar-nav">{nav.map(section=><div className="nav-section" key={section.label}><p className="nav-heading">{section.label}</p>{section.items.filter(item=>item.to!=='/users'||user?.role==='admin').map(item=><NavLink to={item.to} key={item.to} onClick={()=>setOpen(false)} end={item.to==='/'} className={({isActive})=>`nav-link ${isActive?'nav-active':''}`}><item.icon size={18} strokeWidth={1.9}/><span>{item.label}</span>{item.to==='/alerts'&&(unread?.count||0)>0&&<i className="nav-count">{unread?.count}</i>}</NavLink>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><Activity size={21}/><h4>Keep stock in sync</h4><p>Track stock movements, warehouses, and alerts in one place.</p><span>Automatic inventory insights</span></div><button className="sidebar-signout" onClick={logout}><LogOut size={17}/> Sign out <ChevronRight size={15}/></button></div>
    </aside>
    <div className="main-area"><header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-btn" onClick={()=>setOpen(true)}><Menu size={22}/></button><span className="breadcrumb">Workspace <ChevronRight size={15}/> <b>{title}</b></span></div><div className="topbar-right"><span className="topbar-date">{new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</span><button className="icon-btn theme-btn" onClick={toggle} title="Toggle theme">{dark?<Sun size={19}/>:<Moon size={19}/>}</button><NavLink to="/alerts" className="icon-btn relative" title="Notifications"><Bell size={19}/>{!!unread?.count&&<span className="unread-dot"/>}</NavLink><div className="avatar-divider"/><div className="profile-avatar">{user?.fullName?.slice(0,1).toUpperCase()||'A'}</div><div className="profile-label"><strong>{user?.fullName}</strong><span>{user?.role}</span></div></div></header><main className="main-content"><Outlet/></main><footer className="footer"><span>© {new Date().getFullYear()} Stockwise Inventory</span><span>Built for operations that move forward <span className="footer-heart">◆</span></span></footer></div>
  </div>;
}
