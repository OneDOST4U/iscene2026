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
  Clock,
} from 'lucide-react';
import { motion } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable, { RowInput } from 'jspdf-autotable';
import {
  collection,
  addDoc,
  Timestamp,
  getDocs,
  query,
  orderBy,
  updateDoc,
  doc,
} from 'firebase/firestore';
import { db, storage, auth } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';

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
  const [isRegisterOpen, setIsRegisterOpen] = React.useState(false);
  const [registerStatus, setRegisterStatus] = React.useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [registerMessage, setRegisterMessage] = React.useState<string | null>(null);
  const [showSuccessPopup, setShowSuccessPopup] = React.useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = React.useState(false);
  const [adminUser, setAdminUser] = React.useState<User | null>(null);
  const [adminAuthError, setAdminAuthError] = React.useState<string | null>(null);
  const [adminLoading, setAdminLoading] = React.useState(false);
  const [adminEmail, setAdminEmail] = React.useState('');
  const [adminPassword, setAdminPassword] = React.useState('');
  const [registrations, setRegistrations] = React.useState<any[]>([]);
  const [registrationsLoading, setRegistrationsLoading] = React.useState(false);
  const [filterSector, setFilterSector] = React.useState<string>('all');
  const [filterStatus, setFilterStatus] = React.useState<string>('all');

  // Sectors that do NOT require payment or proof of payment
  const noFeeSectors = React.useMemo(
    () => ['Speakers', 'Facilitators', 'Booth (Technologies)', 'Exhibitor', 'DOST'],
    [],
  );

  const [selectedSector, setSelectedSector] = React.useState<string>('');

  const sectorFilterOptions = React.useMemo(
    () =>
      Array.from(
        new Set(
          registrations
            .map((r) => (r.sector as string | undefined) || '')
            .filter((s) => s && s.trim().length > 0),
        ),
      ).sort(),
    [registrations],
  );

  const filteredRegistrations = React.useMemo(
    () =>
      registrations.filter((r) => {
        const sector = (r.sector as string | undefined) || '';
        const status = (r.status as string | undefined) || 'pending';

        if (filterSector !== 'all' && sector !== filterSector) {
          return false;
        }
        if (filterStatus !== 'all' && status !== filterStatus) {
          return false;
        }
        return true;
      }),
    [registrations, filterSector, filterStatus],
  );

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAdminUser(user);
    });
    return () => unsub();
  }, []);

  // Secret URL trigger for admin panel, e.g. https://site.com/?admin=1
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('admin=1')) {
      setIsAdminPanelOpen(true);
      if (auth.currentUser) {
        void loadRegistrations();
      }
    }
  }, []);

  const handleAdminSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAuthError(null);
    setAdminLoading(true);
    try {
      await signInWithEmailAndPassword(auth, adminEmail.trim(), adminPassword);
      await loadRegistrations();
    } catch (err: any) {
      console.error('Admin sign-in error', err);
      setAdminAuthError('Invalid email or password, or you are not authorized.');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleAdminSignOut = async () => {
    await signOut(auth);
    setRegistrations([]);
  };

  const handleExportPdf = () => {
    if (!filteredRegistrations.length) {
      return;
    }

    const doc = new jsPDF('landscape');

    const body: RowInput[] = filteredRegistrations.map((r, index) => {
      const createdAt =
        (r.createdAt as Timestamp | undefined)?.toDate?.() ?? null;

      return [
        index + 1,
        (r.fullName as string) || '',
        (r.email as string) || '',
        (r.sector as string) || '',
        (r.status as string) || 'pending',
        (r.contactNumber as string) || '',
        (r.accommodationDetails as string) || '',
        (r.travelDetails as string) || '',
      ];
    });

    autoTable(doc, {
      head: [
        [
          '#',
          'Full Name',
          'Email',
          'Sector',
          'Status',
          'Contact',
          'Accommodation',
          'Travel',
        ],
      ],
      body,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 136, 229] },
      startY: 15,
    });

    doc.save('iscene-registrations.pdf');
  };

  const handleExportCsv = () => {
    if (!filteredRegistrations.length) {
      return;
    }

    const header = [
      'No.',
      'Full Name',
      'Email',
      'Sector',
      'Status',
      'Contact',
      'Accommodation',
      'Travel',
    ];

    const rows = filteredRegistrations.map((r, index) => [
      String(index + 1),
      (r.fullName as string) || '',
      (r.email as string) || '',
      (r.sector as string) || '',
      (r.status as string) || 'pending',
      (r.contactNumber as string) || '',
      (r.accommodationDetails as string) || '',
      (r.travelDetails as string) || '',
    ]);

    const escapeCell = (cell: string) => {
      if (cell.includes('"') || cell.includes(',') || cell.includes('\n')) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    };

    const csvLines = [
      header.map(escapeCell).join(','),
      ...rows.map((row) => row.map(escapeCell).join(',')),
    ];

    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'iscene-registrations.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const loadRegistrations = async () => {
    if (!auth.currentUser) return;
    setRegistrationsLoading(true);
    setAdminAuthError(null);
    try {
      const q = query(collection(db, 'registrations'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setRegistrations(items);
    } catch (err: any) {
      console.error('Error loading registrations', err);
      setAdminAuthError(
        'Unable to load registrations. Make sure this account is listed as an admin in Firestore rules.'
      );
    } finally {
      setRegistrationsLoading(false);
    }
  };

  const updateRegistrationStatus = async (
    registration: any,
    status: 'pending' | 'approved' | 'declined',
  ) => {
    const id = registration.id as string;
    try {
      await updateDoc(doc(db, 'registrations', id), { status });
      setRegistrations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r)),
      );

      // When a registration is approved, enqueue an email for the participant
      if (status === 'approved') {
        try {
          const to = (registration.email as string) || '';
          const fullName = (registration.fullName as string) || 'Participant';

          if (to) {
            await addDoc(collection(db, 'mail'), {
              to,
              message: {
                subject: 'Your iSCENE 2026 registration is approved',
                text: `Dear ${fullName},

Your registration for the International Smart & Sustainable Cities and Communities Exposition and Networking Engagement (iSCENE 2026) has been approved.

Event Dates: April 9–11, 2026
Venue: Isabela Convention Center (ICON), Cauayan City, Isabela, Philippines.

Please keep this email for your records. We look forward to seeing you at iSCENE 2026.

Best regards,
iSCENE 2026 Organizing Team`,
                html: `<p>Dear ${fullName},</p>
<p>Your registration for the <strong>International Smart &amp; Sustainable Cities and Communities Exposition and Networking Engagement (iSCENE 2026)</strong> has been <strong>approved</strong>.</p>
<p><strong>Event Dates:</strong> April 9–11, 2026<br/>
<strong>Venue:</strong> Isabela Convention Center (ICON), Cauayan City, Isabela, Philippines.</p>
<p>Please keep this email for your records. We look forward to seeing you at <strong>iSCENE 2026</strong>.</p>
<p>Best regards,<br/>
iSCENE 2026 Organizing Team</p>`,
              },
            });
          }
        } catch (emailErr) {
          console.error('Error enqueuing approval email', emailErr);
          setAdminAuthError(
            'Status updated, but failed to enqueue approval email. See console for details.',
          );
        }
      }
    } catch (err) {
      console.error('Error updating status', err);
      setAdminAuthError('Failed to update status. Check console for details.');
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setRegisterStatus('submitting');
    setRegisterMessage(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const email = (formData.get('email') as string) || '';
    const fullName = (formData.get('fullName') as string) || '';
    const positionTitle = (formData.get('positionTitle') as string) || '';
    const contactNumber = (formData.get('contactNumber') as string) || '';
    const sector = (formData.get('sector') as string) || '';
    const sectorOffice = (formData.get('sectorOffice') as string) || '';
    const accommodationDetails = (formData.get('accommodationDetails') as string) || '';
    const travelDetails = (formData.get('travelDetails') as string) || '';
    const notes = (formData.get('notes') as string) || '';
    const proofFile = formData.get('proofOfPayment') as File | null;

    const requiresPayment = sector ? !noFeeSectors.includes(sector) : true;

    if (requiresPayment && (!proofFile || proofFile.size === 0)) {
      setRegisterStatus('error');
      setRegisterMessage('Proof of payment is required for paying participants.');
      return;
    }

    try {
      console.log('Submitting registration to Firestore...', {
        email,
        fullName,
        positionTitle,
        contactNumber,
        sector,
        sectorOffice,
        requiresPayment,
        accommodationDetails,
        travelDetails,
        notes,
      });

      // Store only the Storage path (not a public URL) for better security.
      // Admin tools can generate a download URL later using this path while authenticated.
      let proofOfPaymentPath: string | null = null;

      if (proofFile && proofFile.size > 0) {
        const safeFileName = proofFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const storageRef = ref(storage, `proofOfPayment/${Date.now()}_${safeFileName}`);
        const uploadSnapshot = await uploadBytes(storageRef, proofFile);
        proofOfPaymentPath = uploadSnapshot.ref.fullPath;
      }

      await addDoc(collection(db, 'registrations'), {
        email,
        fullName,
        positionTitle,
        contactNumber,
        sector,
        sectorOffice,
        requiresPayment,
        registrationFee: requiresPayment ? 6500 : 0,
        status: 'pending',
        proofOfPaymentPath,
        accommodationDetails,
        travelDetails,
        notes,
        eventYear: 2026,
        createdAt: Timestamp.now(),
      });

      console.log('Registration saved successfully.');

      setRegisterStatus('success');
      setRegisterMessage('Thank you for registering for iSCENE 2025!');
      form.reset();
      setSelectedSector('');
      setIsRegisterOpen(false);
      setShowSuccessPopup(true);
    } catch (error) {
      console.error('Error saving registration:', error);
      setRegisterStatus('error');
      setRegisterMessage('There was an error saving your registration. Please try again. See console for details.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-bottom border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <div className="flex items-center gap-3">
              <img
                src="/iscene.png"
                alt="iSCENE Logo"
                className="h-8 sm:h-9 md:h-10 w-auto"
              />
              <span className="text-2xl font-black tracking-tighter text-slate-900">
                iSCENE <span className="text-blue-600">2026</span>
              </span>
            </div>
            
            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              {['Overview', 'Focus', 'Highlights', 'Schedule'].map((item) => (
                <a key={item} href={`#${item.toLowerCase()}`} className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">
                  {item}
                </a>
              ))}
              <button
                type="button"
                onClick={() => setIsRegisterOpen(true)}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-full text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
              >
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
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                setIsRegisterOpen(true);
              }}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-xl font-bold"
            >
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
            className="flex flex-col items-center gap-4 mb-8"
          >
            <div className="flex flex-wrap justify-center items-center gap-4 md:gap-8">
              <img
                src="/iscene.png"
                alt="iSCENE Logo"
                className="h-16 md:h-24 lg:h-28 w-auto"
              />
              <img
                src="/isu.png"
                alt="ISU Logo"
                className="h-16 md:h-24 lg:h-28 w-auto"
              />
              <img
                src="/cauayan.png"
                alt="Cauayan City Logo"
                className="h-16 md:h-24 lg:h-28 w-auto"
              />
            </div>
            <div className="inline-flex items-center bg-white px-6 py-3 rounded-full shadow-sm border border-slate-100">
              <span className="text-xs md:text-sm font-bold uppercase tracking-widest text-slate-500">
                International Smart & Sustainable Cities Exposition
              </span>
            </div>
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
            <button
              type="button"
              onClick={() => setIsRegisterOpen(true)}
              className="bg-slate-900 text-white px-10 py-5 rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all flex items-center gap-2 shadow-xl shadow-slate-200"
            >
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
                  src="/icon.jpg"
                  alt="iSCENE Event"
                  className="w-full h-full object-cover"
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
              <div className="flex items-center gap-3 mb-6">
                <img
                  src="/iscene.png"
                  alt="iSCENE Logo"
                  className="h-10 w-auto"
                />
                <span className="text-2xl font-black tracking-tighter text-slate-900">
                  iSCENE <span className="text-blue-600">2026</span>
                </span>
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

      {/* Register Modal */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 sm:p-8 relative max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setIsRegisterOpen(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>
            <div className="flex flex-col items-center gap-2 mb-4">
              <span className="inline-flex items-center rounded-full bg-slate-900 text-white px-4 py-1 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.18em]">
                International Smart &amp; Sustainable Cities Exposition
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 text-center tracking-tight">
                iSCENE <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-green-600">2026</span>{' '}
                Registration
              </h2>
              <p className="text-[11px] sm:text-xs font-medium text-blue-700 uppercase tracking-[0.2em] text-center">
                Co-creating Smart and Sustainable Communities Through People-Centric Innovation
              </p>
            </div>
            <p className="text-slate-600 text-sm mb-3 text-center max-w-2xl mx-auto leading-relaxed">
              The Department of Science and Technology (DOST), in partnership with the Local Government Unit of Cauayan City,
              Isabela State University, and the Smart and Livable Cities Company, will stage the International Smart &amp;
              Sustainable Cities and Communities Exposition and Networking Engagement (iSCENE 2026) on April 9–11, 2026 at the
              Isabela Convention Center (ICON), Cauayan City, Isabela, Philippines, with the theme &quot;Co-creating Smart and
              Sustainable Communities Through People-Centric Innovation.&quot;
            </p>
            <p className="text-slate-600 text-xs sm:text-sm mb-3 text-center max-w-2xl mx-auto leading-relaxed">
              iSCENE serves as a national and international platform that brings together local chief executives, national
              government leaders, academe, industry partners, startups, and development organizations to share knowledge, build
              partnerships, and accelerate the adoption of science, technology, and innovation (STI) solutions that support
              smarter and more sustainable communities.
            </p>
            <p className="text-slate-600 text-xs sm:text-sm mb-4 text-center max-w-2xl mx-auto leading-relaxed">
              The registration fee of ₱6,500.00 per participant is inclusive of a certificate of participation, AM and PM snacks
              and lunch for the three-day event (April 9–11, 2026), smart kit and event giveaways, and transportation during the
              Smart City Tour and project immersion visits.
            </p>
            <div className="mt-2 mb-6 rounded-3xl border border-slate-100 bg-slate-50 p-4 sm:p-5 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                    <Calendar size={18} />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Event Duration
                    </p>
                    <p className="text-sm font-semibold text-slate-900">April 9–11, 2026</p>
                    <p className="text-xs text-slate-500">3-day international exposition &amp; networking engagement</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                    <MapPin size={18} />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Venue</p>
                    <p className="text-sm font-semibold text-slate-900">Isabela Convention Center (ICON)</p>
                    <p className="text-xs text-slate-500">Cauayan City, Isabela, Philippines</p>
                  </div>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 border border-slate-100">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Registration Fee
                  </p>
                  <p className="text-xs text-slate-500">
                    Includes participation, meals, smart kit, giveaways, and Smart City Tour &amp; immersion visits.
                  </p>
                </div>
                <p className="text-lg sm:text-xl font-black text-blue-600 whitespace-nowrap">₱6,500.00</p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] sm:text-xs text-slate-500">
                <div className="flex flex-wrap gap-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 border border-slate-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Certificate of participation
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 border border-slate-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> AM/PM snacks &amp; lunch (3 days)
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 border border-slate-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Smart kit &amp; event giveaways
                  </span>
                </div>
                <a
                  href="https://www.iscene.app/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 font-semibold hover:text-blue-700"
                >
                  www.iscene.app
                </a>
              </div>
            </div>
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                <input
                  required
                  type="email"
                  name="email"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name (Contact Person) *</label>
                <input
                  required
                  type="text"
                  name="fullName"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Juan Dela Cruz"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Position Title (Do not abbreviate) *</label>
                <input
                  required
                  type="text"
                  name="positionTitle"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="City Mayor, University President, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Number *</label>
                <input
                  required
                  type="tel"
                  name="contactNumber"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="09XXXXXXXXX"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sector *</label>
                  <select
                    required
                    name="sector"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={selectedSector}
                    onChange={(e) => setSelectedSector(e.target.value)}
                  >
                    <option value="" disabled>
                      Select sector
                    </option>
                    <option value="PLGU/LGU/MLGU">PLGU/LGU/MLGU</option>
                    <option value="Academe">Academe</option>
                    <option value="Non governmental Organization (NGO non-profit)">
                      Non governmental Organization (NGO non-profit)
                    </option>
                    <option value="National Government Agencies (NGA)">
                      National Government Agencies (NGA)
                    </option>
                    <option value="Private Sector">Private Sector</option>
                    <option value="Industry">Industry</option>
                    <option value="Others">Others</option>
                    <option value="Speakers">Speakers</option>
                    <option value="Facilitators">Facilitators</option>
                    <option value="Booth (Technologies)">Booth (Technologies)</option>
                    <option value="Exhibitor">Exhibitor</option>
                    <option value="DOST">DOST</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Office / Department / Unit *
                  </label>
                  <input
                    required
                    type="text"
                    name="sectorOffice"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., City Planning Office, College of Engineering"
                  />
                </div>
              </div>

              {selectedSector && !noFeeSectors.includes(selectedSector) && (
                <>
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <label className="block text-sm font-semibold text-slate-800 mb-1">
                      Registration Fee – Php 6,500.00
                    </label>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Inclusive of certificate of participation, AM and PM snacks and lunch for the three-day event (April 9–11,
                      2026), smart kit and event giveaways, and transportation during the Smart City Tour and project immersion
                      visits.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-4">
                    <label className="block text-sm font-semibold text-slate-800 mb-1">Payment Instructions</label>
                    <p className="text-xs text-slate-500 mb-2">
                      To finish the registration process, kindly make a payment of the specified amount using the following
                      details:
                    </p>
                    <ul className="text-xs text-slate-600 space-y-1 mb-2">
                      <li>
                        <span className="font-semibold">Bank:</span> LANDBANK OF THE PHILIPPINES
                      </li>
                      <li>
                        <span className="font-semibold">Account Name:</span> CITY GOVERNMENT OF CAUAYAN
                      </li>
                      <li>
                        <span className="font-semibold">Account Number:</span> 0062 0170 40
                      </li>
                    </ul>
                    <p className="text-xs text-slate-500">
                      For payment concerns, you may contact 09757730571 / 09356875841 or email{' '}
                      <a href="mailto:cityinfotech@cityofcauayan.gov.ph" className="text-blue-600 underline">
                        cityinfotech@cityofcauayan.gov.ph
                      </a>
                      .
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-800 mb-1">Proof of Payment *</label>
                    <input
                      type="file"
                      name="proofOfPayment"
                      accept="image/*,application/pdf"
                      className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Upload a clear copy of the deposit slip or online transfer confirmation. Max 100 MB.
                    </p>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Accommodation Details</label>
                <textarea
                  rows={2}
                  name="accommodationDetails"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  placeholder="Hotel name, check-in/check-out dates, room sharing details, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Travel Details</label>
                <textarea
                  rows={2}
                  name="travelDetails"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  placeholder="Flight number, arrival/departure times, airport of origin, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Additional Notes / Special Requests</label>
                <textarea
                  rows={3}
                  name="notes"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  placeholder="Flight details, accommodation info, dietary needs, accessibility requirements, etc."
                />
              </div>

              <p className="text-xs text-slate-400">
                All information collected shall be used exclusively by the iSCENE team for further improvement of our event. DOST
                R02 is duty-bound to protect such information as prescribed under Republic Act 10173 or the National Privacy Act of
                2012 without the expressed written consent of the users concerned.
              </p>

              <button
                type="submit"
                disabled={registerStatus === 'submitting'}
                className="w-full bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold text-sm sm:text-base hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 mt-2"
              >
                {registerStatus === 'submitting' ? 'Submitting...' : 'Submit Registration'}
              </button>
              {registerMessage && (
                <p
                  className={`text-sm mt-2 text-center ${
                    registerStatus === 'success' ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {registerMessage}
                </p>
              )}
            </form>
          </div>
        </div>
      )}
      {isAdminPanelOpen && (
        <div className="fixed inset-0 z-50 bg-slate-50">
          <div className="flex flex-col h-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 relative">
            <button
              type="button"
              onClick={() => setIsAdminPanelOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <img src="/iscene.png" alt="iSCENE Logo" className="h-8 w-auto" />
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                    iSCENE 2026 Admin
                  </h2>
                  <p className="text-xs text-slate-500">
                    View registrations and manage approval status.
                  </p>
                </div>
              </div>
              {adminUser && (
                <button
                  type="button"
                  onClick={handleAdminSignOut}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Sign out
                </button>
              )}
            </div>

            {!adminUser && (
              <form onSubmit={handleAdminSignIn} className="space-y-4 mb-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Admin email
                    </label>
                    <input
                      required
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="admin@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Password
                    </label>
                    <input
                      required
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                {adminAuthError && (
                  <p className="text-xs text-red-600">{adminAuthError}</p>
                )}
                <button
                  type="submit"
                  disabled={adminLoading}
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
                >
                  {adminLoading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            )}

            {adminUser && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Signed in as <span className="font-semibold">{adminUser.email}</span>
                  </p>
                  <button
                    type="button"
                    onClick={loadRegistrations}
                    disabled={registrationsLoading}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:text-slate-400"
                  >
                    {registrationsLoading ? 'Refreshing…' : 'Refresh list'}
                  </button>
                </div>
                {adminAuthError && (
                  <p className="text-xs text-red-600 mb-1">{adminAuthError}</p>
                )}
                <div className="border border-slate-100 rounded-2xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-[0.16em] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span>Registrations</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={filterSector}
                        onChange={(e) => setFilterSector(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="all">All sectors</option>
                        {sectorFilterOptions.map((sector) => (
                          <option key={sector} value={sector}>
                            {sector}
                          </option>
                        ))}
                      </select>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="all">All statuses</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="declined">Declined</option>
                      </select>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handleExportPdf}
                          className="inline-flex items-center rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800"
                        >
                          Export PDF
                        </button>
                        <button
                          type="button"
                          onClick={handleExportCsv}
                          className="inline-flex items-center rounded-xl bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
                        >
                          Export CSV
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="max-h-[50vh] overflow-y-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Name</th>
                          <th className="px-3 py-2 text-left font-semibold">Email</th>
                          <th className="px-3 py-2 text-left font-semibold">Sector</th>
                          <th className="px-3 py-2 text-left font-semibold">Contact</th>
                          <th className="px-3 py-2 text-left font-semibold">Accommodation</th>
                          <th className="px-3 py-2 text-left font-semibold">Travel</th>
                          <th className="px-3 py-2 text-left font-semibold">Status</th>
                          <th className="px-3 py-2 text-left font-semibold">Created</th>
                          <th className="px-3 py-2 text-left font-semibold">Proof</th>
                          <th className="px-3 py-2 text-left font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRegistrations.length === 0 && !registrationsLoading && (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-3 py-4 text-center text-slate-400"
                            >
                              No registrations found.
                            </td>
                          </tr>
                        )}
                        {filteredRegistrations.map((r) => {
                          const createdAt =
                            (r.createdAt as Timestamp | undefined)?.toDate?.() ??
                            null;
                          const fullName = (r.fullName as string) || '';
                          const position = (r.positionTitle as string) || '';
                          const contact = (r.contactNumber as string) || '';
                          const accommodation = (r.accommodationDetails as string) || '';
                          const travel = (r.travelDetails as string) || '';
                          const notes = (r.notes as string) || '';
                          const proofPath = (r.proofOfPaymentPath as string) || '';
                          return (
                            <tr key={r.id} className="border-t border-slate-100">
                              <td className="px-3 py-2 align-top text-slate-900">
                                <div className="font-semibold">{fullName || '—'}</div>
                                {position && (
                                  <div className="text-[11px] text-slate-500">
                                    {position}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 align-top text-slate-600">
                                <div>{r.email}</div>
                                {notes && (
                                  <div className="text-[11px] text-slate-500 line-clamp-2">
                                    {notes}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2 align-top text-slate-600">
                                {r.sector || '—'}
                              </td>
                              <td className="px-3 py-2 align-top text-slate-600">
                                {contact || '—'}
                              </td>
                              <td className="px-3 py-2 align-top text-slate-600 max-w-[140px]">
                                <div className="text-[11px] line-clamp-3">
                                  {accommodation || '—'}
                                </div>
                              </td>
                              <td className="px-3 py-2 align-top text-slate-600 max-w-[140px]">
                                <div className="text-[11px] line-clamp-3">
                                  {travel || '—'}
                                </div>
                              </td>
                              <td className="px-3 py-2 align-top">
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    r.status === 'approved'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : r.status === 'declined'
                                      ? 'bg-red-50 text-red-700'
                                      : 'bg-slate-50 text-slate-600'
                                  }`}
                                >
                                  {r.status || 'pending'}
                                </span>
                              </td>
                              <td className="px-3 py-2 align-top text-slate-500 whitespace-nowrap">
                                {createdAt
                                  ? createdAt.toLocaleString()
                                  : '—'}
                              </td>
                              <td className="px-3 py-2 align-top">
                                {proofPath ? (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        const storageRef = ref(storage, proofPath);
                                        const url = await getDownloadURL(storageRef);
                                        window.open(url, '_blank', 'noopener,noreferrer');
                                      } catch (err) {
                                        console.error('Error opening proof', err);
                                        setAdminAuthError(
                                          'Unable to open proof of payment. Check console for details.'
                                        );
                                      }
                                    }}
                                    className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-semibold hover:bg-blue-100"
                                  >
                                    View
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-slate-400">None</span>
                                )}
                              </td>
                              <td className="px-3 py-2 align-top">
                                <div className="flex flex-wrap gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateRegistrationStatus(r, 'approved')
                                    }
                                    className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold hover:bg-emerald-100"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateRegistrationStatus(r, 'declined')
                                    }
                                    className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[11px] font-semibold hover:bg-red-100"
                                  >
                                    Decline
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateRegistrationStatus(r, 'pending')
                                    }
                                    className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 text-[11px] font-semibold hover:bg-slate-100"
                                  >
                                    Reset
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {showSuccessPopup && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 relative text-center">
            <button
              type="button"
              onClick={() => setShowSuccessPopup(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>
            <div className="flex flex-col items-center gap-3 mb-3">
              <img
                src="/iscene.png"
                alt="iSCENE Logo"
                className="h-12 w-auto"
              />
              <h3 className="text-lg font-bold text-slate-900">
                Registration Submitted
              </h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Your registration has been submitted successfully. Thank you for being part of iSCENE 2026.
            </p>
            <button
              type="button"
              onClick={() => setShowSuccessPopup(false)}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
