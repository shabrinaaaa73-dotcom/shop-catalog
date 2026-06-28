// App.js — ShopCatalog Upgraded (Level 1 + 2 + 3)
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  Image,
  TextInput,
  Modal,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── KONSTANTA ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 6; // jumlah item per "halaman" pagination
const FAVORITES_KEY = '@shopcatalog_favorites';

// ─── SKELETON CARD ────────────────────────────────────────────────────────────
function SkeletonCard() {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.card, { opacity: pulse }]}>
      <View style={styles.skeletonImage} />
      <View style={styles.cardInfo}>
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, { width: '60%', marginTop: 8 }]} />
        <View style={[styles.skeletonLine, { width: '40%', marginTop: 8 }]} />
      </View>
    </Animated.View>
  );
}

// ─── PRODUCT CARD ─────────────────────────────────────────────────────────────
function ProductCard({ item, onPress, isFavorite, onToggleFavorite }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
        <Image source={{ uri: item.image }} style={styles.cardImage} resizeMode="contain" />
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.cardPrice}>${item.price.toFixed(2)}</Text>
          <Text style={styles.cardRating}>⭐ {item.rating.rate} ({item.rating.count} reviews)</Text>
          <Text style={styles.cardCategory}>{item.category}</Text>
        </View>
        {/* FAVORIT TOGGLE */}
        <TouchableOpacity style={styles.favBtn} onPress={() => onToggleFavorite(item.id)}>
          <Text style={{ fontSize: 20 }}>{isFavorite ? '❤️' : '🤍'}</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── DETAIL MODAL ─────────────────────────────────────────────────────────────
function DetailModal({ item, visible, onClose, isFavorite, onToggleFavorite }) {
  if (!item) return null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalContainer}>
        <TouchableOpacity style={styles.modalClose} onPress={onClose}>
          <Text style={styles.modalCloseText}>✕ Tutup</Text>
        </TouchableOpacity>
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Image source={{ uri: item.image }} style={styles.modalImage} resizeMode="contain" />
          <Text style={styles.modalTitle}>{item.title}</Text>
          <View style={styles.modalRow}>
            <Text style={styles.modalPrice}>${item.price.toFixed(2)}</Text>
            <TouchableOpacity onPress={() => onToggleFavorite(item.id)}>
              <Text style={{ fontSize: 28 }}>{isFavorite ? '❤️' : '🤍'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.modalRating}>⭐ {item.rating.rate} dari {item.rating.count} ulasan</Text>
          <Text style={styles.modalCategoryBadge}>{item.category}</Text>
          <Text style={styles.modalDesc}>{item.description}</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  // Data
  const [allProducts, setAllProducts] = useState([]);   // semua data dari API
  const [displayed, setDisplayed] = useState([]);       // data yang ditampilkan (setelah filter+sort+page)
  const [page, setPage] = useState(1);                  // halaman saat ini (pagination)

  // UI State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filter & Sort
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Semua');
  const [sortBy, setSortBy] = useState('default'); // 'default' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc'
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Favorit
  const [favorites, setFavorites] = useState(new Set());

  // Detail Modal
  const [selectedItem, setSelectedItem] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // ── Computed: daftar kategori unik ─────────────────────────────────────────
  const categories = ['Semua', ...Array.from(new Set(allProducts.map(p => p.category)))];

  // ── Load favorit dari AsyncStorage saat mount ──────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(FAVORITES_KEY);
        if (stored) setFavorites(new Set(JSON.parse(stored)));
      } catch (_) {}
    })();
  }, []);

  // ── Simpan favorit ke AsyncStorage setiap kali berubah ────────────────────
  useEffect(() => {
    AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])).catch(() => {});
  }, [favorites]);

  // ── Toggle Favorit ─────────────────────────────────────────────────────────
  function toggleFavorite(id) {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Fetch produk ──────────────────────────────────────────────────────────
  async function fetchProducts() {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get('https://fakestoreapi.com/products');
      setAllProducts(response.data);
      setPage(1);
    } catch (err) {
      setError('Gagal memuat produk. Periksa koneksi internetmu.');
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    setRefreshing(true);
    await fetchProducts();
    setRefreshing(false);
  }

  useEffect(() => { fetchProducts(); }, []);

  // ── Filter + Sort + Pagination — dijalankan tiap ada perubahan ────────────
  useEffect(() => {
    let filtered = [...allProducts];

    // Filter kategori
    if (selectedCategory !== 'Semua') {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }

    // Filter pencarian
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    }

    // Sorting
    switch (sortBy) {
      case 'price_asc':  filtered.sort((a, b) => a.price - b.price); break;
      case 'price_desc': filtered.sort((a, b) => b.price - a.price); break;
      case 'name_asc':   filtered.sort((a, b) => a.title.localeCompare(b.title)); break;
      case 'name_desc':  filtered.sort((a, b) => b.title.localeCompare(a.title)); break;
      default: break; // urutan API asli
    }

    // Pagination: slice berdasarkan page saat ini
    setDisplayed(filtered.slice(0, page * PAGE_SIZE));
  }, [allProducts, search, selectedCategory, sortBy, page]);

  // ── Load More (Infinite Scroll) ────────────────────────────────────────────
  function handleLoadMore() {
    // Hitung total setelah filter & sort
    let filtered = allProducts.filter(p =>
      (selectedCategory === 'Semua' || p.category === selectedCategory) &&
      (!search.trim() || p.title.toLowerCase().includes(search.toLowerCase()))
    );
    if (displayed.length >= filtered.length) return; // sudah semua

    setLoadingMore(true);
    setTimeout(() => {
      setPage(prev => prev + 1);
      setLoadingMore(false);
    }, 600);
  }

  // ── Sort label helper ──────────────────────────────────────────────────────
  const sortLabels = {
    default: '📋 Default',
    price_asc: '💰 Harga ↑',
    price_desc: '💰 Harga ↓',
    name_asc: '🔤 Nama A→Z',
    name_desc: '🔤 Nama Z→A',
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.title}>🛒 ShopCatalog</Text>
        <TouchableOpacity onPress={() => setSortBy('default') || setSelectedCategory('Semua') || setSearch('')}>
          <Text style={styles.resetText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Cari produk atau kategori..."
          placeholderTextColor="#aaa"
          value={search}
          onChangeText={text => { setSearch(text); setPage(1); }}
        />
        <TouchableOpacity style={styles.sortBtn} onPress={() => setShowSortMenu(v => !v)}>
          <Text style={styles.sortBtnText}>{sortLabels[sortBy]}</Text>
        </TouchableOpacity>
      </View>

      {/* SORT DROPDOWN */}
      {showSortMenu && (
        <View style={styles.sortMenu}>
          {Object.entries(sortLabels).map(([key, label]) => (
            <TouchableOpacity key={key} style={[styles.sortOption, sortBy === key && styles.sortOptionActive]}
              onPress={() => { setSortBy(key); setPage(1); setShowSortMenu(false); }}>
              <Text style={[styles.sortOptionText, sortBy === key && { color: '#00b894', fontWeight: 'bold' }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* CATEGORY CHIPS */}
      {!loading && !error && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow} contentContainerStyle={{ paddingHorizontal: 12 }}>
          {categories.map(cat => (
            <TouchableOpacity key={cat}
              style={[styles.chip, selectedCategory === cat && styles.chipActive]}
              onPress={() => { setSelectedCategory(cat); setPage(1); }}>
              <Text style={[styles.chipText, selectedCategory === cat && styles.chipTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* LOADING: SKELETON */}
      {loading && (
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          {Array(5).fill(0).map((_, i) => <SkeletonCard key={i} />)}
        </ScrollView>
      )}

      {/* ERROR */}
      {!loading && error && (
        <View style={styles.center}>
          <Text style={styles.errorText}>😢 {error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchProducts}>
            <Text style={styles.retryText}>🔄 Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SUKSES: FLATLIST */}
      {!loading && !error && (
        <FlatList
          data={displayed}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={{ padding: 12 }}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={
            <Text style={styles.listHeader}>
              {displayed.length} dari{' '}
              {allProducts.filter(p =>
                (selectedCategory === 'Semua' || p.category === selectedCategory) &&
                (!search.trim() || p.title.toLowerCase().includes(search.toLowerCase()))
              ).length} produk
            </Text>
          }
          ListEmptyComponent={
            // EMPTY STATE
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🛍️</Text>
              <Text style={styles.emptyTitle}>Produk tidak ditemukan</Text>
              <Text style={styles.emptySubtitle}>Coba ubah kata kunci atau kategori pencarian</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => { setSearch(''); setSelectedCategory('Semua'); }}>
                <Text style={styles.retryText}>🔄 Reset Filter</Text>
              </TouchableOpacity>
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color="#00b894" style={{ marginVertical: 16 }} /> : null}
          renderItem={({ item }) => (
            <ProductCard
              item={item}
              isFavorite={favorites.has(item.id)}
              onToggleFavorite={toggleFavorite}
              onPress={() => { setSelectedItem(item); setModalVisible(true); }}
            />
          )}
        />
      )}

      {/* DETAIL MODAL */}
      <DetailModal
        item={selectedItem}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        isFavorite={selectedItem ? favorites.has(selectedItem.id) : false}
        onToggleFavorite={toggleFavorite}
      />
    </SafeAreaView>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0', paddingTop: Platform.OS === 'android' ? 32 : 0 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#0a2e0a' },
  resetText: { fontSize: 13, color: '#00b894', fontWeight: '600' },

  // Search & Sort
  searchRow: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 8, gap: 8 },
  searchInput: { flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#ddd', color: '#222' },
  sortBtn: { backgroundColor: '#00b894', borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center' },
  sortBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  // Sort dropdown
  sortMenu: { marginHorizontal: 12, backgroundColor: '#fff', borderRadius: 10, elevation: 4, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, overflow: 'hidden', marginBottom: 8 },
  sortOption: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  sortOptionActive: { backgroundColor: '#f0fdf8' },
  sortOptionText: { fontSize: 14, color: '#444' },

  // Category chips
  categoryRow: { maxHeight: 44, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#e0e0e0', marginRight: 8 },
  chipActive: { backgroundColor: '#00b894' },
  chipText: { fontSize: 13, color: '#555', fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  // Card
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, alignItems: 'center' },
  cardImage: { width: 80, height: 80, marginRight: 12 },
  cardInfo: { flex: 1, justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#0a2e0a' },
  cardPrice: { fontSize: 16, fontWeight: 'bold', color: '#00b894', marginTop: 4 },
  cardRating: { fontSize: 12, color: '#888', marginTop: 3 },
  cardCategory: { fontSize: 11, color: '#aaa', marginTop: 3, textTransform: 'capitalize' },
  favBtn: { padding: 6 },

  // Skeleton
  skeletonImage: { width: 80, height: 80, borderRadius: 8, backgroundColor: '#e0e0e0', marginRight: 12 },
  skeletonLine: { height: 14, borderRadius: 6, backgroundColor: '#e0e0e0', width: '80%' },

  // Center (loading/error)
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { fontSize: 16, color: '#e74c3c', textAlign: 'center', marginBottom: 16 },
  retryBtn: { backgroundColor: '#00b894', paddingVertical: 12, paddingHorizontal: 28, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  // List
  listHeader: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 10 },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyIcon: { fontSize: 56, marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 20 },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalClose: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  modalCloseText: { fontSize: 15, color: '#00b894', fontWeight: '600' },
  modalImage: { width: '100%', height: 220, marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0a2e0a', marginBottom: 10 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalPrice: { fontSize: 22, fontWeight: 'bold', color: '#00b894' },
  modalRating: { fontSize: 14, color: '#888', marginBottom: 10 },
  modalCategoryBadge: { alignSelf: 'flex-start', backgroundColor: '#e0f7f0', color: '#00b894', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, fontSize: 12, fontWeight: '700', marginBottom: 14, overflow: 'hidden', textTransform: 'capitalize' },
  modalDesc: { fontSize: 14, color: '#555', lineHeight: 22 },
});