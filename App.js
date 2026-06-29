import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, SafeAreaView, Alert, Modal, Switch, Keyboard, ScrollView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// ─── Konstanta ────────────────────────────────────────────────────
const CATEGORIES = ['Semua', 'Pribadi', 'Kerja', 'Belanja', 'Lainnya'];
const SORT_OPTIONS = [
  { label: 'Terbaru', value: 'newest' },
  { label: 'Terlama', value: 'oldest' },
  { label: 'A–Z',    value: 'alpha'  },
  { label: 'Selesai',value: 'done'   },
];

// ─── API: fetch quotes & cache ke AsyncStorage ────────────────────
const fetchAndCacheQuote = async () => {
  try {
    const cached = await AsyncStorage.getItem('@quote_cache');
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      // Gunakan cache jika < 1 jam
      if (Date.now() - timestamp < 3_600_000) return data;
    }
    const res  = await fetch('https://api.quotable.io/random?maxLength=80');
    const json = await res.json();
    const data = { text: json.content, author: json.author };
    await AsyncStorage.setItem('@quote_cache', JSON.stringify({ data, timestamp: Date.now() }));
    return data;
  } catch {
    // Offline → kembalikan cache lama (jika ada), atau null
    try {
      const cached = await AsyncStorage.getItem('@quote_cache');
      return cached ? JSON.parse(cached).data : null;
    } catch {
      return null;
    }
  }
};

// ─── Komponen Utama ───────────────────────────────────────────────
export default function App() {
  // Auth
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin]                         = useState('');

  // Data
  const [notes, setNotes]   = useState([]);
  const [stats, setStats]   = useState({ created: 0, done: 0 });
  const [quote, setQuote]   = useState(null);

  // Input & Filter
  const [input,       setInput]       = useState('');
  const [category,    setCategory]    = useState('Pribadi');
  const [search,      setSearch]      = useState('');
  const [filterCat,   setFilterCat]   = useState('Semua');
  const [sortMode,    setSortMode]    = useState('newest');

  // UI
  const [isDarkMode,        setIsDarkMode]        = useState(false);
  const [settingsVisible,   setSettingsVisible]   = useState(false);
  const [changePin,         setChangePin]         = useState('');
  const [changePinConfirm,  setChangePinConfirm]  = useState('');

  // ── Load data saat pertama kali ──
  useEffect(() => {
    (async () => {
      const [savedNotes, savedStats, savedTheme] = await Promise.all([
        AsyncStorage.getItem('@notes'),
        AsyncStorage.getItem('@stats'),
        AsyncStorage.getItem('@theme'),
      ]);
      if (savedNotes) setNotes(JSON.parse(savedNotes));
      if (savedStats) setStats(JSON.parse(savedStats));
      if (savedTheme) setIsDarkMode(JSON.parse(savedTheme));

      // Fetch quote (dengan cache offline)
      const q = await fetchAndCacheQuote();
      if (q) setQuote(q);
    })();
  }, []);

  // ── Helper simpan ──
  const saveAll = (newNotes, newStats) => {
    setNotes(newNotes);
    setStats(newStats);
    AsyncStorage.setItem('@notes', JSON.stringify(newNotes));
    AsyncStorage.setItem('@stats', JSON.stringify(newStats));
  };

  // ── Toggle dark mode (simpan ke AsyncStorage) ──
  const toggleDark = (val) => {
    setIsDarkMode(val);
    AsyncStorage.setItem('@theme', JSON.stringify(val));
  };

  // ── LOGIN menggunakan SecureStore ──────────────────────────────
  useEffect(() => {
    // Pastikan PIN default tersimpan di SecureStore saat install pertama
    (async () => {
      const stored = await SecureStore.getItemAsync('app_pin');
      if (!stored) await SecureStore.setItemAsync('app_pin', '1234');
    })();
  }, []);

  const handleLogin = async () => {
    const storedPin = await SecureStore.getItemAsync('app_pin');
    if (pin === storedPin) setIsAuthenticated(true);
    else Alert.alert('Error', 'PIN salah!');
  };

  const handleChangePin = async () => {
    if (changePin.length < 4) return Alert.alert('Error', 'PIN minimal 4 digit');
    if (changePin !== changePinConfirm) return Alert.alert('Error', 'PIN tidak cocok');
    await SecureStore.setItemAsync('app_pin', changePin);
    Alert.alert('Berhasil', 'PIN berhasil diubah');
    setChangePin('');
    setChangePinConfirm('');
  };

  // ── CREATE ─────────────────────────────────────────────────────
  const addNote = () => {
    if (!input.trim()) return Alert.alert('Error', 'Catatan tidak boleh kosong!');
    const newNote = {
      id:       Date.now().toString(),
      text:     input.trim(),
      done:     false,
      category,
      time:     new Date().toLocaleString('id-ID'),    // Timestamp
    };
    saveAll([newNote, ...notes], { ...stats, created: stats.created + 1 });
    setInput('');
    Keyboard.dismiss();
  };

  // ── DELETE ─────────────────────────────────────────────────────
  const deleteNote = (id) => {
    Alert.alert('Konfirmasi', 'Hapus catatan ini?', [
      { text: 'Batal' },
      {
        text: 'Hapus', style: 'destructive',
        onPress: () => {
          const updated = notes.filter(n => n.id !== id);
          saveAll(updated, { ...stats, created: Math.max(0, stats.created - 1), done: updated.filter(n => n.done).length });
        },
      },
    ]);
  };

  // ── TOGGLE DONE ────────────────────────────────────────────────
  const toggleDone = (id) => {
    const updated = notes.map(n => n.id === id ? { ...n, done: !n.done } : n);
    saveAll(updated, { ...stats, done: updated.filter(n => n.done).length });
  };

  // ── FILTER + SORT ──────────────────────────────────────────────
  const filteredNotes = notes
    .filter(n => filterCat === 'Semua' || n.category === filterCat)
    .filter(n => n.text.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortMode === 'newest') return b.id - a.id;
      if (sortMode === 'oldest') return a.id - b.id;
      if (sortMode === 'alpha')  return a.text.localeCompare(b.text);
      if (sortMode === 'done')   return Number(b.done) - Number(a.done);
      return 0;
    });

  // ── Warna tema ──────────────────────────────────────────────────
  const bg   = isDarkMode ? '#1a0a1b' : '#fff0f5';
  const card = isDarkMode ? '#2d1b2e' : '#ffffff';
  const txt  = isDarkMode ? '#f0d6f5' : '#333333';

  // ── LOGIN SCREEN ───────────────────────────────────────────────
  if (!isAuthenticated) return (
    <View style={styles.loginContainer}>
      <Text style={styles.mainTitle}>NoteKeeper ✨</Text>
      <Text style={{ color: '#aaa', marginBottom: 20 }}>Masukkan PIN untuk masuk</Text>
      <TextInput
        style={[styles.input, { width: 200, textAlign: 'center', letterSpacing: 8 }]}
        secureTextEntry keyboardType="numeric" maxLength={4}
        value={pin} onChangeText={setPin} placeholder="• • • •"
      />
      <TouchableOpacity style={[styles.pinkBtn, { marginTop: 10, paddingHorizontal: 40 }]} onPress={handleLogin}>
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>Login</Text>
      </TouchableOpacity>
      <Text style={{ color: '#ccc', marginTop: 20, fontSize: 12 }}>Default PIN: 1234</Text>
    </View>
  );

  // ── MAIN SCREEN ────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.mainTitle, { fontSize: 22 }]}>NoteKeeper ✨</Text>
        <TouchableOpacity onPress={() => setSettingsVisible(true)}>
          <Text style={{ fontSize: 24 }}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Quote of the day (API + cache offline) */}
      {quote && (
        <View style={[styles.quoteBox, { backgroundColor: card }]}>
          <Text style={{ fontSize: 11, color: '#ff69b4', fontWeight: 'bold', marginBottom: 2 }}>
            💡 KUTIPAN HARI INI
          </Text>
          <Text style={{ fontSize: 12, color: txt, fontStyle: 'italic' }}>"{quote.text}"</Text>
          <Text style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>— {quote.author}</Text>
        </View>
      )}

      {/* Stats */}
      <Text style={styles.stats}>
        Total: {stats.created}  |  Selesai: {stats.done}  |  Aktif: {stats.created - stats.done}
      </Text>

      {/* Search */}
      <TextInput
        style={[styles.searchBar, { color: txt }]}
        value={search} onChangeText={setSearch} placeholder="🔎 Cari catatan..."
        placeholderTextColor="#aaa"
      />

      {/* Filter Kategori */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.catBtn, filterCat === cat && styles.catBtnActive]}
            onPress={() => setFilterCat(cat)}
          >
            <Text style={{ color: filterCat === cat ? '#fff' : '#ff69b4', fontSize: 12 }}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Sorting */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
        {SORT_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.sortBtn, sortMode === opt.value && styles.sortBtnActive]}
            onPress={() => setSortMode(opt.value)}
          >
            <Text style={{ color: sortMode === opt.value ? '#fff' : '#888', fontSize: 11 }}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Input Catatan */}
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0, color: txt }]}
          value={input} onChangeText={setInput} placeholder="Tambah catatan..."
          placeholderTextColor="#aaa"
        />
        <TouchableOpacity style={styles.pinkBtn} onPress={addNote}>
          <Text style={{ color: '#fff' }}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Pilih Kategori untuk input */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
        {CATEGORIES.filter(c => c !== 'Semua').map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.catBtn, category === cat && styles.catBtnActive, { marginBottom: 0 }]}
            onPress={() => setCategory(cat)}
          >
            <Text style={{ color: category === cat ? '#fff' : '#ff69b4', fontSize: 11 }}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Daftar Catatan */}
      <FlatList
        data={filteredNotes}
        keyExtractor={item => item.id}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={{ color: '#aaa' }}>Belum ada catatan.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: card }]}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => toggleDone(item.id)}>
              {/* Tag Kategori */}
              <View style={[styles.tag, { backgroundColor: '#fff0f5' }]}>
                <Text style={{ fontSize: 10, color: '#ff69b4' }}>{item.category}</Text>
              </View>
              <Text style={[item.done ? styles.done : styles.text, { color: item.done ? '#aaa' : txt }]}>
                {item.text}
              </Text>
              {/* Timestamp */}
              <Text style={styles.time}>{item.time}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => deleteNote(item.id)} style={{ padding: 4 }}>
              <Text style={{ color: 'red' }}>🗑️</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Modal Pengaturan */}
      <Modal visible={settingsVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { backgroundColor: card }]}>
            <Text style={[styles.title, { color: txt }]}>Pengaturan</Text>

            {/* Dark Mode */}
            <View style={styles.row}>
              <Text style={{ color: txt }}>Mode Gelap</Text>
              <Switch value={isDarkMode} onValueChange={toggleDark} />
            </View>

            {/* Ganti PIN (SecureStore) */}
            <Text style={{ color: '#ff69b4', fontWeight: 'bold', marginTop: 16, marginBottom: 6 }}>
              Ganti PIN
            </Text>
            <TextInput
              style={[styles.input, { marginBottom: 8, color: txt }]}
              secureTextEntry keyboardType="numeric" maxLength={6}
              placeholder="PIN baru" placeholderTextColor="#aaa"
              value={changePin} onChangeText={setChangePin}
            />
            <TextInput
              style={[styles.input, { marginBottom: 8, color: txt }]}
              secureTextEntry keyboardType="numeric" maxLength={6}
              placeholder="Konfirmasi PIN" placeholderTextColor="#aaa"
              value={changePinConfirm} onChangeText={setChangePinConfirm}
            />
            <TouchableOpacity style={[styles.pinkBtn, { marginBottom: 12 }]} onPress={handleChangePin}>
              <Text style={{ color: '#fff' }}>Simpan PIN</Text>
            </TouchableOpacity>

            {/* Hapus Semua */}
            <TouchableOpacity
              style={styles.delAll}
              onPress={() => {
                setNotes([]);
                setStats({ created: 0, done: 0 });
                AsyncStorage.multiRemove(['@notes', '@stats']);
                setSettingsVisible(false);
              }}
            >
              <Text style={{ color: '#fff' }}>Hapus Semua Catatan</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setSettingsVisible(false)} style={{ alignItems: 'center', marginTop: 12 }}>
              <Text style={{ color: '#ff69b4' }}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:      { flex: 1, padding: 16 },
  loginContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffe4e1' },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  mainTitle:      { fontSize: 26, fontWeight: 'bold', color: '#ff69b4' },
  title:          { fontSize: 20, fontWeight: 'bold', color: '#ff1493', marginBottom: 12 },
  quoteBox:       { padding: 12, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#ffc0cb' },
  input:          { borderWidth: 1.5, borderColor: '#ffb6c1', padding: 11, borderRadius: 12, backgroundColor: '#fff', width: '100%', marginBottom: 10 },
  searchBar:      { borderWidth: 1, borderColor: '#ffc0cb', padding: 10, borderRadius: 10, backgroundColor: '#fff', marginBottom: 8 },
  pinkBtn:        { backgroundColor: '#ff69b4', padding: 12, borderRadius: 12, alignItems: 'center', marginLeft: 6, paddingHorizontal: 18 },
  card:           { flexDirection: 'row', alignItems: 'center', padding: 14, marginVertical: 5, borderRadius: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 4 },
  text:           { fontSize: 15 },
  done:           { textDecorationLine: 'line-through' },
  time:           { fontSize: 10, color: '#bbb', marginTop: 4 },
  stats:          { color: '#ff69b4', fontWeight: 'bold', marginBottom: 8, fontSize: 12 },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent:   { padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  row:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 10 },
  delAll:         { backgroundColor: '#ff4757', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  catBtn:         { borderWidth: 1, borderColor: '#ffb6c1', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8, marginBottom: 4 },
  catBtnActive:   { backgroundColor: '#ff69b4', borderColor: '#ff69b4' },
  sortBtn:        { borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginRight: 6 },
  sortBtnActive:  { backgroundColor: '#c084c0', borderColor: '#c084c0' },
  tag:            { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginBottom: 4, borderWidth: 1, borderColor: '#ffc0cb' },
  inputRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
});