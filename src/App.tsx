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
  ChevronLeft,
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
  where,
} from 'firebase/firestore';
import { db, storage, auth } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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
   const [isParticipantLoginOpen, setIsParticipantLoginOpen] = React.useState(false);
   const [participantEmail, setParticipantEmail] = React.useState('');
   const [participantPassword, setParticipantPassword] = React.useState('');
   const [participantAuthError, setParticipantAuthError] = React.useState<string | null>(null);
   const [participantAuthLoading, setParticipantAuthLoading] = React.useState(false);
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
  const [paymentMethod, setPaymentMethod] = React.useState<'upload' | 'pay_at_venue'>('upload');

  // Only show fee/payment UI when the selected sector requires payment (not Speakers, Facilitators, etc.)
  const sectorRequiresPayment = Boolean(selectedSector && !noFeeSectors.includes(selectedSector));

  // Countdown to April 9, 2026 (event start)
  const eventDate = React.useMemo(() => new Date(2026, 3, 9, 0, 0, 0), []);
  const [countdown, setCountdown] = React.useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [countdownEnded, setCountdownEnded] = React.useState(false);

  React.useEffect(() => {
    const tick = () => {
      const now = new Date();
      const diff = eventDate.getTime() - now.getTime();
      if (diff <= 0) {
        setCountdownEnded(true);
        return;
      }
      setCountdown({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [eventDate]);

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

  const totalRegistrations = registrations.length;
  const pendingRegistrations = React.useMemo(
    () => registrations.filter((r) => (r.status as string | undefined) === 'pending').length,
    [registrations],
  );
  const approvedRegistrations = React.useMemo(
    () => registrations.filter((r) => (r.status as string | undefined) === 'approved').length,
    [registrations],
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

  const handleParticipantSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setParticipantAuthError(null);
    setParticipantAuthLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        participantEmail.trim(),
        participantPassword,
      );
      const uid = credential.user.uid;

      const q = query(
        collection(db, 'registrations'),
        where('uid', '==', uid),
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        await signOut(auth);
        setParticipantAuthError(
          'No registration was found for this account. Please register first or use a different email.',
        );
        return;
      }

      const reg = snap.docs[0].data();
      const status = (reg.status as string | undefined) || 'pending';

      if (status !== 'approved') {
        await signOut(auth);
        setParticipantAuthError(
          status === 'pending'
            ? 'Your registration is still pending approval. You will receive an email once it is approved.'
            : 'Your registration has not been approved. Please contact the organizers for assistance.',
        );
        return;
      }

      // Login ok and registration approved – close modal and clear fields.
      setIsParticipantLoginOpen(false);
      setParticipantEmail('');
      setParticipantPassword('');
    } catch (err: any) {
      console.error('Participant sign-in error', err);
      const code = err?.code as string | undefined;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setParticipantAuthError('Incorrect email or password.');
      } else if (code === 'auth/user-not-found') {
        setParticipantAuthError('No account found with this email. Please register first.');
      } else if (code === 'auth/too-many-requests') {
        setParticipantAuthError('Too many attempts. Please try again later.');
      } else {
        setParticipantAuthError('Unable to sign in. Please try again.');
      }
    } finally {
      setParticipantAuthLoading(false);
    }
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
    const password = (formData.get('password') as string) || '';
    const confirmPassword = (formData.get('confirmPassword') as string) || '';
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
    const payByUpload = requiresPayment && paymentMethod === 'upload';

    if (payByUpload && (!proofFile || proofFile.size === 0)) {
      setRegisterStatus('error');
      setRegisterMessage('Proof of payment is required when paying by upload.');
      return;
    }

    if (password.length < 6) {
      setRegisterStatus('error');
      setRegisterMessage('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setRegisterStatus('error');
      setRegisterMessage('Passwords do not match.');
      return;
    }

    try {
      // Create the user account first so the registrant can log in later (after approval).
      // Firebase will also sign them in after account creation.
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const uid = credential.user.uid;

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
        uid,
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
        uid,
        email,
        fullName,
        positionTitle,
        contactNumber,
        sector,
        sectorOffice,
        requiresPayment,
        registrationFee: requiresPayment ? 6500 : 0,
        paymentMethod: requiresPayment ? paymentMethod : null,
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
      setRegisterMessage('Thank you for registering for iSCENE 2026!');
      form.reset();
      setSelectedSector('');
      setPaymentMethod('upload');
      setIsRegisterOpen(false);
      setShowSuccessPopup(true);
    } catch (error) {
      console.error('Error saving registration:', error);
      setRegisterStatus('error');
      const code = (error as any)?.code as string | undefined;
      if (code === 'auth/email-already-in-use') {
        setRegisterMessage('This email is already registered. Please log in instead.');
      } else if (code === 'auth/invalid-email') {
        setRegisterMessage('Please enter a valid email address.');
      } else if (code === 'auth/weak-password') {
        setRegisterMessage('Password is too weak. Please use at least 6 characters.');
      } else {
        setRegisterMessage('There was an error saving your registration. Please try again. See console for details.');
      }
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
              {['Teaser', 'Overview', 'Focus', 'Highlights', 'Schedule'].map((item) => (
                <a key={item} href={`#${item.toLowerCase()}`} className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">
                  {item}
                </a>
              ))}
              <button
                type="button"
                onClick={() => setIsParticipantLoginOpen(true)}
                className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
              >
                Participant Login
              </button>
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
            {['Teaser', 'Overview', 'Focus', 'Highlights', 'Schedule'].map((item) => (
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
                setIsParticipantLoginOpen(true);
              }}
              className="w-full border border-slate-200 text-slate-800 px-6 py-3 rounded-xl font-bold"
            >
              Participant Login
            </button>
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

          {/* Countdown to April 9, 2026 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="mb-12"
          >
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Event starts in</p>
            {countdownEnded ? (
              <p className="text-xl font-bold text-green-600">Event has started! See you at iSCENE 2026.</p>
            ) : (
              <div className="flex flex-wrap justify-center gap-3 sm:gap-6">
                {[
                  { value: countdown.days, label: 'Days' },
                  { value: countdown.hours, label: 'Hours' },
                  { value: countdown.minutes, label: 'Minutes' },
                  { value: countdown.seconds, label: 'Seconds' },
                ].map(({ value, label }) => (
                  <div key={label} className="bg-white rounded-2xl shadow-sm border border-slate-100 px-5 py-4 min-w-[4.5rem] sm:min-w-[5.5rem]">
                    <span className="block text-2xl sm:text-3xl font-black text-slate-900 tabular-nums">{String(value).padStart(2, '0')}</span>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
                  </div>
                ))}
              </div>
            )}
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

      {/* YouTube Teaser Section */}
      <section id="teaser" className="py-16 md:py-24 bg-white border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">Watch the Teaser</h2>
            <p className="text-slate-600 max-w-xl mx-auto">Get a glimpse of what awaits at iSCENE 2026.</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="aspect-video w-full max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-xl border border-slate-200 bg-slate-100"
          >
            <iframe
              src="https://www.youtube.com/embed/0FTd0p8P4hk"
              title="iSCENE 2026 Teaser"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          </motion.div>
        </div>
      </section>

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
                <a href="https://www.iscene.app" className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-blue-600 hover:text-white transition-all">
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
                <li className="flex items-center gap-2"><ExternalLink size={16} /> www.iscene.app</li>
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

      {/* Participant Login Modal */}
      {isParticipantLoginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 relative">
            <button
              type="button"
              onClick={() => setIsParticipantLoginOpen(false)}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold text-slate-900 mb-1 text-center">Participant Login</h2>
            <p className="text-xs text-slate-500 mb-4 text-center">
              Use the email and password you provided during registration. Only approved registrations can sign in.
            </p>
            <form onSubmit={handleParticipantSignIn} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  required
                  type="email"
                  value={participantEmail}
                  onChange={(e) => setParticipantEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input
                  required
                  type="password"
                  value={participantPassword}
                  onChange={(e) => setParticipantPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Your password"
                />
              </div>
              {participantAuthError && (
                <p className="text-xs text-red-600 mt-1">{participantAuthError}</p>
              )}
              <button
                type="submit"
                disabled={participantAuthLoading}
                className="w-full bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors mt-1"
              >
                {participantAuthLoading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Register Modal */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white max-h-screen overflow-hidden sm:max-w-lg sm:mx-auto sm:my-4 sm:rounded-2xl sm:shadow-2xl sm:max-h-[95vh]">
          {/* Header bar */}
          <div className="flex items-center justify-between h-14 px-4 border-b border-slate-100 shrink-0">
            <button
              type="button"
              onClick={() => setIsRegisterOpen(false)}
              className="p-2 -ml-2 text-slate-600 hover:text-slate-900"
              aria-label="Close"
            >
              <ChevronLeft size={24} />
            </button>
            <h1 className="text-lg font-bold text-slate-900">Registration</h1>
            <div className="w-10" aria-hidden />
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Banner with logo */}
            <div className="relative w-full h-40 sm:h-48 bg-gradient-to-br from-slate-800 via-teal-900 to-blue-900 overflow-hidden">
              <img
                src="/icon.jpg"
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-70"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <div className="absolute bottom-4 left-4 flex items-end">
                <img
                  src="/iscene.png"
                  alt="iSCENE 2026"
                  className="h-12 sm:h-14 w-auto drop-shadow-lg"
                />
              </div>
            </div>

            {/* Event info */}
            <div className="px-4 pt-6 pb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">
                International Smart &amp; Sustainable Cities Exposition
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                Co-creating Smart and Sustainable Communities Through People-Centric Innovation.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-start gap-3 rounded-xl bg-slate-100 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">April 9-11, 2026</p>
                    <p className="text-xs text-slate-500">Event Dates</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl bg-slate-100 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">Isabela Convention Center (ICON)</p>
                    <p className="text-xs text-slate-500">Venue Location</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Show registration fee only when the selected sector requires payment (hidden for Speakers, Facilitators, Exhibitor, DOST, etc.) */}
            {sectorRequiresPayment && (
              <div className="mx-4 mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm text-slate-700">
                  Registration fee: <strong className="text-blue-600">₱6,500.00</strong> — inclusive of certificate, meals, smart kit, giveaways, and Smart City Tour.
                </p>
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} className="px-4 pb-8">
              {/* Attendee Information */}
              <h3 className="text-base font-bold text-blue-600 mb-3">Attendee Information</h3>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                  <input
                    required
                    type="text"
                    name="fullName"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Juan Dela Cruz"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email Address *</label>
                  <input
                    required
                    type="email"
                    name="email"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="juan.dc@example.com"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
                    <input
                      required
                      type="password"
                      name="password"
                      minLength={6}
                      autoComplete="new-password"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Create a password"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password *</label>
                    <input
                      required
                      type="password"
                      name="confirmPassword"
                      minLength={6}
                      autoComplete="new-password"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Repeat password"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Contact Number *</label>
                  <input
                    required
                    type="tel"
                    name="contactNumber"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="+63 9XX XXX XXXX"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sector *</label>
                  <select
                    required
                    name="sector"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-10"
                    value={selectedSector}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedSector(v);
                      if (noFeeSectors.includes(v)) setPaymentMethod('upload');
                    }}
                  >
                    <option value="" disabled>Select Sector</option>
                    <option value="PLGU/LGU/MLGU">PLGU/LGU/MLGU</option>
                    <option value="Academe">Academe</option>
                    <option value="Non governmental Organization (NGO non-profit)">Non governmental Organization (NGO non-profit)</option>
                    <option value="National Government Agencies (NGA)">National Government Agencies (NGA)</option>
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Position Title *</label>
                  <input
                    required
                    type="text"
                    name="positionTitle"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g. Director"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Office / Department / Unit *</label>
                  <input
                    required
                    type="text"
                    name="sectorOffice"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Name of your organization"
                  />
                </div>
              </div>

              {/* Payment section: only for sectors that require payment */}
              {sectorRequiresPayment && (
                <div className="mb-6 space-y-4">
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                    <label className="block text-sm font-semibold text-slate-800 mb-2">Payment method</label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="upload"
                          checked={paymentMethod === 'upload'}
                          onChange={() => setPaymentMethod('upload')}
                          className="rounded-full border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-slate-700">Upload proof of payment</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="pay_at_venue"
                          checked={paymentMethod === 'pay_at_venue'}
                          onChange={() => setPaymentMethod('pay_at_venue')}
                          className="rounded-full border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-slate-700">Pay at the venue</span>
                      </label>
                    </div>
                    {paymentMethod === 'pay_at_venue' && (
                      <p className="text-xs text-slate-600 mt-2">You will pay ₱6,500.00 on-site. No upload needed.</p>
                    )}
                  </div>
                  {paymentMethod === 'upload' && (
                    <>
                      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                        <p className="text-xs text-slate-600 mb-2">
                          Bank: LANDBANK OF THE PHILIPPINES · Account: CITY GOVERNMENT OF CAUAYAN · 0062 0170 40. For payment concerns: 09757730571 / 09356875841 or cityinfotech@cityofcauayan.gov.ph
                        </p>
                        <label className="block text-sm font-semibold text-slate-800 mb-1">Proof of Payment *</label>
                        <input
                          type="file"
                          name="proofOfPayment"
                          accept="image/*,application/pdf"
                          className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Logistics */}
              <h3 className="text-base font-bold text-blue-600 mb-3">Logistics</h3>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Accommodation Details</label>
                  <textarea
                    rows={2}
                    name="accommodationDetails"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    placeholder="Hotel preferences or pre-booked accommodation"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Travel Details</label>
                  <textarea
                    rows={2}
                    name="travelDetails"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    placeholder="Flight number / ETA / Arrival point"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Additional Notes / Dietary Requirements</label>
                  <textarea
                    rows={3}
                    name="notes"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    placeholder="Any other information we should know"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={registerStatus === 'submitting'}
                className="w-full bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed text-white py-3.5 rounded-xl font-bold text-base hover:bg-blue-700 transition-all"
              >
                {registerStatus === 'submitting' ? 'Submitting...' : 'Complete Registration'}
              </button>
              {registerMessage && (
                <p className={`text-sm mt-3 text-center ${registerStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {registerMessage}
                </p>
              )}

              {/* Privacy Notice */}
              <div className="mt-6 flex gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <Shield className="shrink-0 text-blue-600 mt-0.5" size={20} />
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong className="text-slate-800">Privacy Notice:</strong> iSCENE 2026 is committed to protecting your personal information. By submitting this form, you consent to the collection and processing of your data in accordance with Republic Act No. 10173 (Data Privacy Act of 2012). Your data will be used solely for registration and event-related communications.
                </p>
              </div>
            </form>

            {/* Footer */}
            <footer className="px-4 py-4 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-400">© 2026 ISCENE ORGANIZING COMMITTEE</p>
            </footer>
          </div>
        </div>
      )}
      {isAdminPanelOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950 text-slate-50">
          <div className="flex h-full max-w-6xl mx-auto">
            {/* Sidebar */}
            <aside className="hidden md:flex w-60 flex-col bg-slate-950 border-r border-slate-800 py-6 px-4">
              <div className="flex items-center gap-2 mb-8">
                <img src="/iscene.png" alt="iSCENE Logo" className="h-8 w-auto" />
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Admin
                  </p>
                  <h2 className="text-sm font-semibold">iSCENE 2026</h2>
                </div>
              </div>
              <nav className="flex-1 space-y-1 text-sm">
                {['Dashboard', 'Participants', 'Sessions', 'Booths', 'Food', 'Analytics'].map(
                  (item) => (
                    <button
                      key={item}
                      type="button"
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left ${
                        item === 'Dashboard'
                          ? 'bg-slate-900 text-slate-50'
                          : 'text-slate-400 hover:bg-slate-900/40 hover:text-slate-100'
                      }`}
                    >
                      <span className="text-[13px]">{item}</span>
                    </button>
                  ),
                )}
              </nav>
              {adminUser && (
                <div className="mt-4 pt-4 border-t border-slate-800">
                  <p className="text-[11px] text-slate-500 mb-1 line-clamp-1">
                    {adminUser.email}
                  </p>
                  <button
                    type="button"
                    onClick={handleAdminSignOut}
                    className="w-full text-[11px] font-semibold text-red-300 hover:text-red-200 border border-red-500/60 rounded-full px-3 py-1"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </aside>

            {/* Main content */}
            <div className="flex-1 flex flex-col px-4 sm:px-6 lg:px-8 py-6 relative overflow-hidden">
              <button
                type="button"
                onClick={() => setIsAdminPanelOpen(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-slate-200"
              >
                <X size={20} />
              </button>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold">Dashboard</h2>
                  <p className="text-xs text-slate-400">
                    Overview of registrations and event activity.
                  </p>
                </div>
                {adminUser && (
                  <span className="text-[11px] text-slate-500 hidden sm:inline">
                    {adminUser.email}
                  </span>
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
              <div className="space-y-6">
                {/* Summary cards */}
                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
                  <div className="rounded-2xl bg-slate-900/60 border border-slate-800 px-4 py-3">
                    <p className="text-[11px] text-slate-400 mb-1">Total registrations</p>
                    <p className="text-xl font-bold">{totalRegistrations}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-900/60 border border-slate-800 px-4 py-3">
                    <p className="text-[11px] text-slate-400 mb-1">Pending approvals</p>
                    <p className="text-xl font-bold text-amber-300">{pendingRegistrations}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-900/60 border border-slate-800 px-4 py-3">
                    <p className="text-[11px] text-slate-400 mb-1">Approved participants</p>
                    <p className="text-xl font-bold text-emerald-300">{approvedRegistrations}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-900/60 border border-slate-800 px-4 py-3">
                    <p className="text-[11px] text-slate-400 mb-1">Food claims</p>
                    <p className="text-xl font-bold text-sky-300">0</p>
                  </div>
                </section>
                {adminAuthError && (
                  <p className="text-xs text-red-400 mb-1">{adminAuthError}</p>
                )}
                <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60">
                  <div className="bg-slate-900/60 px-4 py-3 text-[11px] font-semibold text-slate-300 uppercase tracking-[0.16em] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span>Registrations overview</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={filterSector}
                        onChange={(e) => setFilterSector(e.target.value)}
                        className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                        className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="all">All statuses</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="declined">Declined</option>
                      </select>
                    </div>
                  </div>
                  <div className="max-h-[50vh] overflow-y-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-900 text-slate-300">
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
