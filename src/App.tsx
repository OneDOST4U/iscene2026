/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Calendar, 
  MapPin, 
  Users, 
  Lightbulb, 
  Shield, 
  TrendingUp, 
  Leaf, 
  Cpu, 
  Zap, 
  Sprout, 
  Globe, 
  Award,
  ChevronRight,
  Facebook,
  ExternalLink,
  Menu,
  X,
  Clock
} from 'lucide-react';
import { motion } from 'motion/react';
import { Analytics } from '@vercel/analytics/react';

const colors = {
  red: '#E53935',
  orange: '#FB8C00',
  yellow: '#FDD835',
  green: '#43A047',
  blue: '#1E88E5',
};

const SectionTitle = ({ children, subtitle }: { children: React.ReactNode, subtitle?: string }) => (
  <div className="mb-12 text-center">
    <motion.h2 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight"
    >
      {children}
    </motion.h2>
    {subtitle && (
      <motion.p 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.1 }}
        className="text-slate-600 max-w-2xl mx-auto text-lg"
      >
        {subtitle}
      </motion.p>
    )}
    <div className="w-24 h-1.5 bg-gradient-to-r from-blue-500 via-green-500 to-yellow-500 mx-auto mt-6 rounded-full" />
  </div>
);

const Card = ({ title, description, icon: Icon, color }: { title: string, description: string, icon: any, color: string }) => (
  <motion.div 
    whileHover={{ y: -5 }}
    className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all"
  >
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6`} style={{ backgroundColor: `${color}15`, color: color }}>
      <Icon size={24} />
    </div>
    <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
    <p className="text-slate-600 leading-relaxed">{description}</p>
  </motion.div>
);

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-bottom border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-1">
                {[colors.red, colors.orange, colors.yellow, colors.green, colors.blue].map((c, i) => (
                  <div key={i} className="w-3 h-3 rounded-full border border-white" style={{ backgroundColor: c }} />
                ))}
              </div>
              <span className="text-2xl font-black tracking-tighter text-slate-900 ml-2">iSCENE <span className="text-blue-600">2026</span></span>
            </div>
            
            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              {['Overview', 'Focus', 'Highlights', 'Schedule'].map((item) => (
                <a key={item} href={`#${item.toLowerCase()}`} className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">
                  {item}
                </a>
              ))}
              <button className="bg-blue-600 text-white px-6 py-2.5 rounded-full text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">
                Register Now
              </button>
            </div>

            {/* Mobile Nav Toggle */}
            <div className="md:hidden">
              <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-slate-600">
                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden bg-white border-t border-slate-100 p-4 space-y-4 shadow-xl"
          >
            {['Overview', 'Focus', 'Highlights', 'Schedule'].map((item) => (
              <a 
                key={item} 
                href={`#${item.toLowerCase()}`} 
                onClick={() => setIsMenuOpen(false)}
                className="block px-4 py-2 text-slate-600 font-medium"
              >
                {item}
              </a>
            ))}
            <button className="w-full bg-blue-600 text-white px-6 py-3 rounded-xl font-bold">
              Register Now
            </button>
          </motion.div>
        )}
      </nav>

      {/* Hero Section */}
      <header className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob" />
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-green-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000" />
          <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-yellow-100 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-slate-100 mb-8"
          >
            <span className="flex -space-x-1">
              {[colors.red, colors.orange, colors.yellow, colors.green, colors.blue].map((c, i) => (
                <div key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
              ))}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500">International Smart & Sustainable Cities Exposition</span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-5xl md:text-7xl font-black text-slate-900 mb-6 leading-[1.1] tracking-tight"
          >
            Co-creating <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-green-600">Smart & Sustainable</span> Communities
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-xl md:text-2xl text-slate-600 mb-12 max-w-3xl mx-auto font-medium"
          >
            Through People-Centric Innovation
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col md:flex-row items-center justify-center gap-6 mb-16"
          >
            <div className="flex items-center gap-3 bg-white px-6 py-4 rounded-2xl shadow-sm border border-slate-100">
              <Calendar className="text-blue-600" size={24} />
              <div className="text-left">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Date</p>
                <p className="font-bold text-slate-900">April 9-11, 2026</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-white px-6 py-4 rounded-2xl shadow-sm border border-slate-100">
              <MapPin className="text-green-600" size={24} />
              <div className="text-left">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Location</p>
                <p className="font-bold text-slate-900">ICON, Cauayan City, Isabela</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-wrap justify-center gap-4"
          >
            <button className="bg-slate-900 text-white px-10 py-5 rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all flex items-center gap-2 shadow-xl shadow-slate-200">
              Secure Your Spot <ChevronRight size={20} />
            </button>
            <button className="bg-white text-slate-900 border border-slate-200 px-10 py-5 rounded-2xl font-bold text-lg hover:bg-slate-50 transition-all">
              Download Brochure
            </button>
          </motion.div>
        </div>
      </header>

      {/* Overview Section */}
      <section id="overview" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-sm font-bold text-blue-600 uppercase tracking-[0.2em] mb-4">Event Overview</h2>
              <h3 className="text-4xl font-bold text-slate-900 mb-6 leading-tight">A Philippine-led platform for global innovation.</h3>
              <p className="text-lg text-slate-600 mb-6 leading-relaxed">
                iSCENE is a premier platform that brings together local chief executives, national government leaders, academe, industry, and business players for knowledge-sharing and network-building.
              </p>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Our end goal is accelerating the promotion and implementation of innovative solutions that help create smarter and more sustainable communities across the Philippines and beyond.
              </p>
              <div className="grid grid-cols-2 gap-6">
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-3xl font-black text-blue-600 mb-1">2026</p>
                  <p className="text-sm font-bold text-slate-500 uppercase">Scaling Action</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-3xl font-black text-green-600 mb-1">ICON</p>
                  <p className="text-sm font-bold text-slate-500 uppercase">Premier Venue</p>
                </div>
              </div>
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="aspect-square bg-slate-100 rounded-3xl overflow-hidden shadow-2xl">
                <img 
                  src="https://picsum.photos/seed/smartcity/800/800" 
                  alt="Smart City Concept" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="absolute -bottom-8 -left-8 bg-white p-8 rounded-3xl shadow-xl border border-slate-100 max-w-xs hidden lg:block">
                <p className="text-slate-900 font-bold mb-2 italic">"Turning 'smart city' from an idea into real public value."</p>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-1 bg-blue-600 rounded-full" />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Purpose & Mission</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Focus Areas */}
      <section id="focus" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionTitle subtitle="Anchored on People-Centric Innovation, iSCENE 2026 aligns technology and collaboration around outcomes that matter.">
            Our Core Focus
          </SectionTitle>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <Card 
              title="Human Well-Being" 
              description="People-focused services and essential systems that improve quality of life." 
              icon={Users} 
              color={colors.red} 
            />
            <Card 
              title="Wealth Protection" 
              description="Risk reduction and resilience priorities to safeguard communities." 
              icon={Shield} 
              color={colors.orange} 
            />
            <Card 
              title="Wealth Creation" 
              description="Growth, enterprise, and innovation capacity for economic prosperity." 
              icon={TrendingUp} 
              color={colors.blue} 
            />
            <Card 
              title="Sustainability" 
              description="Environmental sustainability, ecosystem resilience, and clean energy." 
              icon={Leaf} 
              color={colors.green} 
            />
          </div>
        </div>
      </section>

      {/* Main Topics */}
      <section className="py-24 bg-slate-900 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-blue-600/10 skew-x-12 transform translate-x-1/2" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="mb-16">
            <h2 className="text-sm font-bold text-blue-400 uppercase tracking-[0.2em] mb-4">Thematic Pillars</h2>
            <h3 className="text-4xl md:text-5xl font-bold mb-6">Main Topics of <span className="text-blue-400">iSCENE 2026</span></h3>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-12">
            {[
              { title: "Disaster Resilience", icon: Shield, desc: "Network of physical devices and systems for enhanced disaster response and mitigation." },
              { title: "AI & Cybersecurity", icon: Cpu, desc: "Intelligent machines and secure systems for cognitive problem-solving and data protection." },
              { title: "Startup Innovation", icon: Lightbulb, desc: "Algorithms and models that identify patterns and drive entrepreneurial breakthroughs." },
              { title: "Energy Efficiency", icon: Zap, desc: "Optimizing hardware and software for sustainable power consumption and management." },
              { title: "Smart Agriculture", icon: Sprout, desc: "Distributed networks and IoT devices for precision farming and food security." },
              { title: "Green Technologies", icon: Leaf, desc: "Sensors and systems for monitoring environmental conditions and promoting clean energy." }
            ].map((topic, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="group"
              >
                <div className="flex items-start gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center group-hover:bg-blue-600 transition-all duration-300">
                    <topic.icon size={28} className="text-blue-400 group-hover:text-white" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold mb-3">{topic.title}</h4>
                    <p className="text-slate-400 leading-relaxed">{topic.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Highlights Section */}
      <section id="highlights" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionTitle subtitle="Experience the natural step in scaling what works through co-creation.">
            Event Highlights
          </SectionTitle>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: "Speakers' Session", icon: Users, color: 'bg-green-500', desc: "High-value sessions focused on transformative innovation and practical solutions." },
              { title: "Technologies Exhibition", icon: Cpu, color: 'bg-red-500', desc: "Curated expo of ready-to-adopt solutions in AI, robotics, and circular economy." },
              { title: "Robofusion", icon: Zap, color: 'bg-blue-500', desc: "Tech-forward segment spotlighting robotics and strengthening youth participation." },
              { title: "Philippine SSC Awards", icon: Award, color: 'bg-yellow-500', desc: "Recognizing maturity and scaling models through the Smart & Sustainable Communities Awards." },
              { title: "Capacity Development", icon: Lightbulb, color: 'bg-orange-500', desc: "Strategic foresight sessions to strengthen LGU capabilities in implementing SSCP projects." },
              { title: "Industry Engagement", icon: Globe, color: 'bg-indigo-500', desc: "Dedicated networking for collaboration matching with local and international players." },
              { title: "Project Site Visits", icon: MapPin, color: 'bg-emerald-500', desc: "Proof of implementation through visits to SUCs and LGU service sites." },
              { title: "Culture & Arts Night", icon: Users, color: 'bg-pink-500', desc: "A strong opening experience anchoring the expo in local place, people, and identity." },
              { title: "Gawagaway-yan Festival", icon: Zap, color: 'bg-purple-500', desc: "Festive experience commemorating the success and progress of Cauayan City." }
            ].map((item, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="relative group overflow-hidden rounded-3xl border border-slate-100 p-8 hover:border-slate-200 transition-all"
              >
                <div className={`w-12 h-12 ${item.color} rounded-xl flex items-center justify-center mb-6 text-white shadow-lg`}>
                  <item.icon size={24} />
                </div>
                <h4 className="text-xl font-bold text-slate-900 mb-3">{item.title}</h4>
                <p className="text-slate-600 text-sm leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Schedule Section */}
      <section id="schedule" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionTitle subtitle="Join us for four days of intensive collaboration and discovery.">
            Event Schedule
          </SectionTitle>

          <div className="space-y-12">
            {[
              { 
                day: "Day 0", 
                date: "April 8, 2026 | Wednesday", 
                events: [
                  { time: "10:00 AM - 03:00 PM", activity: "Arrival of Delegates", venue: "Cauayan City Airport" },
                  { time: "01:00 PM - 05:00 PM", activity: "Registration and Claiming of Kits", venue: "SM City Cauayan" },
                  { time: "06:00 PM - 09:00 PM", activity: "Culture and the Arts Night", venue: "F.L.Dy Coliseum" }
                ]
              },
              { 
                day: "Day 1", 
                date: "April 9, 2026 | Thursday", 
                events: [
                  { time: "08:00 AM - 12:00 NN", activity: "Presidential Program & Opening Ceremonies", venue: "ICON Main Hall" },
                  { time: "01:00 PM - 05:00 PM", activity: "Plenary & Breakout Sessions", venue: "ICON Main Hall" }
                ]
              },
              { 
                day: "Day 2", 
                date: "April 10, 2026 | Friday", 
                events: [
                  { time: "09:00 AM - 12:00 NN", activity: "Knowledge & Collaboration Sessions", venue: "ICON Main Hall" },
                  { time: "01:00 PM - 05:00 PM", activity: "Expo Walkthroughs & Partnership Dialogues", venue: "ICON Function Rooms" }
                ]
              },
              { 
                day: "Day 3", 
                date: "April 11, 2026 | Saturday", 
                events: [
                  { time: "09:00 AM - 12:00 NN", activity: "Visit to Cauayan City Smart Command Center", venue: "Cauayan City" },
                  { time: "01:00 PM - 05:00 PM", activity: "Tour of Smart Agriculture Facilities & Health Hubs", venue: "Cauayan City" }
                ]
              }
            ].map((day, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden"
              >
                <div className="bg-slate-900 text-white p-6 md:px-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <span className="text-blue-400 font-bold uppercase tracking-widest text-xs">{day.day}</span>
                    <h4 className="text-xl font-bold">{day.date}</h4>
                  </div>
                  <Clock size={24} className="text-slate-500 hidden md:block" />
                </div>
                <div className="divide-y divide-slate-100">
                  {day.events.map((event, j) => (
                    <div key={j} className="p-6 md:px-10 flex flex-col md:flex-row md:items-center gap-4 md:gap-12">
                      <div className="w-48 shrink-0">
                        <p className="text-sm font-bold text-blue-600">{event.time}</p>
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-slate-900 text-lg">{event.activity}</p>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500">
                        <MapPin size={16} />
                        <span className="text-sm font-medium">{event.venue}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-100 pt-20 pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <div className="flex -space-x-1">
                  {[colors.red, colors.orange, colors.yellow, colors.green, colors.blue].map((c, i) => (
                    <div key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <span className="text-2xl font-black tracking-tighter text-slate-900 ml-2">iSCENE <span className="text-blue-600">2026</span></span>
              </div>
              <p className="text-slate-500 max-w-sm mb-8 leading-relaxed">
                The International Smart & Sustainable Cities & Communities Exposition and Networking Engagement. Co-creating the future of urban living.
              </p>
              <div className="flex gap-4">
                <a href="https://facebook.com/ISCENE.PH" className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-blue-600 hover:text-white transition-all">
                  <Facebook size={20} />
                </a>
                <a href="https://www.iscene.ph" className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-blue-600 hover:text-white transition-all">
                  <Globe size={20} />
                </a>
              </div>
            </div>
            <div>
              <h5 className="font-bold text-slate-900 mb-6 uppercase tracking-widest text-xs">Quick Links</h5>
              <ul className="space-y-4 text-slate-500 font-medium">
                <li><a href="#overview" className="hover:text-blue-600 transition-colors">About iSCENE</a></li>
                <li><a href="#focus" className="hover:text-blue-600 transition-colors">Our Focus</a></li>
                <li><a href="#highlights" className="hover:text-blue-600 transition-colors">Event Highlights</a></li>
                <li><a href="#schedule" className="hover:text-blue-600 transition-colors">Schedule</a></li>
              </ul>
            </div>
            <div>
              <h5 className="font-bold text-slate-900 mb-6 uppercase tracking-widest text-xs">Contact Us</h5>
              <ul className="space-y-4 text-slate-500 font-medium">
                <li className="flex items-center gap-2"><MapPin size={16} /> Cauayan City, Isabela</li>
                <li className="flex items-center gap-2"><ExternalLink size={16} /> www.iscene.ph</li>
                <li className="flex items-center gap-2"><Facebook size={16} /> ISCENE.PH</li>
              </ul>
            </div>
          </div>
          
          <div className="pt-10 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
            <p className="text-slate-400 text-sm font-medium">
              © 2026 iSCENE. All rights reserved. Co-organized by Smart and Livable Cities Company.
            </p>
            <div className="flex gap-8 text-slate-400 text-sm font-medium">
              <a href="#" className="hover:text-slate-600">Privacy Policy</a>
              <a href="#" className="hover:text-slate-600">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
      <Analytics />
    </div>
  );
}
