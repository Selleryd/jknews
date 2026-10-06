'use client';
import {useEffect,useState} from 'react';
import {Moon,Sun} from 'lucide-react';

export function ThemeToggle(){
 const [light,setLight]=useState(true);
 useEffect(()=>{let saved='light';try{saved=localStorage.getItem('jew-knows-theme')||'light'}catch{};const value=saved==='light';setLight(value);document.documentElement.dataset.theme=value?'light':'dark';},[]);
 function toggle(){const value=!light;setLight(value);document.documentElement.dataset.theme=value?'light':'dark';try{localStorage.setItem('jew-knows-theme',value?'light':'dark')}catch{}}
 return <button className="icon-button theme-toggle" onClick={toggle} aria-label={light?'Switch to dark mode':'Switch to light mode'} title={light?'Dark mode':'Light mode'}>{light?<Moon size={18}/>:<Sun size={18}/>}</button>;
}
