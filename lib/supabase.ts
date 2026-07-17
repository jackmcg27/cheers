import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and fill them in.'
  );
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; display_name: string | null; avatar_url: string | null; created_at: string };
        Insert: { id: string; display_name?: string | null; avatar_url?: string | null };
        Update: { display_name?: string | null; avatar_url?: string | null };
        Relationships: [];
      };
      bars: {
        Row: {
          id: string;
          place_id: string;
          name: string;
          address: string | null;
          lat: number;
          lng: number;
          photo_ref: string | null;
          created_at: string;
        };
        Insert: {
          place_id: string;
          name: string;
          address?: string | null;
          lat: number;
          lng: number;
          photo_ref?: string | null;
        };
        Update: Partial<{
          place_id: string;
          name: string;
          address: string | null;
          lat: number;
          lng: number;
          photo_ref: string | null;
        }>;
        Relationships: [];
      };
      trips: {
        Row: {
          id: string;
          user_id: string;
          crawl_id: string | null;
          started_at: string;
          ended_at: string | null;
          total_distance_m: number | null;
          total_duration_s: number | null;
          photo_url: string | null;
          created_at: string;
          target_bar_id: string | null;
          phase: 'traveling' | 'arrived';
          route_index: number;
        };
        Insert: {
          user_id: string;
          crawl_id?: string | null;
          started_at?: string;
          target_bar_id?: string | null;
          phase?: 'traveling' | 'arrived';
          route_index?: number;
        };
        Update: {
          crawl_id?: string | null;
          ended_at?: string | null;
          total_distance_m?: number | null;
          total_duration_s?: number | null;
          photo_url?: string | null;
          target_bar_id?: string | null;
          phase?: 'traveling' | 'arrived';
          route_index?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'trips_crawl_id_fkey';
            columns: ['crawl_id'];
            isOneToOne: false;
            referencedRelation: 'crawls';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'trips_target_bar_id_fkey';
            columns: ['target_bar_id'];
            isOneToOne: false;
            referencedRelation: 'bars';
            referencedColumns: ['id'];
          },
        ];
      };
      trip_stops: {
        Row: {
          id: string;
          trip_id: string;
          bar_id: string;
          stop_order: number;
          arrived_at: string;
          left_at: string | null;
        };
        Insert: { trip_id: string; bar_id: string; stop_order: number; arrived_at?: string };
        Update: { left_at?: string | null };
        Relationships: [
          {
            foreignKeyName: 'trip_stops_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'trips';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'trip_stops_bar_id_fkey';
            columns: ['bar_id'];
            isOneToOne: false;
            referencedRelation: 'bars';
            referencedColumns: ['id'];
          },
        ];
      };
      drink_logs: {
        Row: {
          id: string;
          trip_stop_id: string;
          drink_name: string | null;
          companion_id: string | null;
          logged_at: string;
        };
        Insert: {
          trip_stop_id: string;
          drink_name?: string | null;
          companion_id?: string | null;
          logged_at?: string;
        };
        Update: { drink_name?: string | null };
        Relationships: [
          {
            foreignKeyName: 'drink_logs_trip_stop_id_fkey';
            columns: ['trip_stop_id'];
            isOneToOne: false;
            referencedRelation: 'trip_stops';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'drink_logs_companion_id_fkey';
            columns: ['companion_id'];
            isOneToOne: false;
            referencedRelation: 'trip_companions';
            referencedColumns: ['id'];
          },
        ];
      };
      trip_companions: {
        Row: {
          id: string;
          trip_id: string;
          user_id: string | null;
          guest_name: string | null;
          status: 'pending' | 'accepted' | 'declined';
          hidden_at: string | null;
          created_at: string;
        };
        Insert: {
          trip_id: string;
          user_id?: string | null;
          guest_name?: string | null;
          status?: 'pending' | 'accepted' | 'declined';
        };
        Update: { status?: 'pending' | 'accepted' | 'declined'; hidden_at?: string | null };
        Relationships: [
          {
            foreignKeyName: 'trip_companions_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'trips';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'trip_companions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      follows: {
        Row: { follower_id: string; followee_id: string; created_at: string };
        Insert: { follower_id: string; followee_id: string };
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'follows_follower_id_fkey';
            columns: ['follower_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'follows_followee_id_fkey';
            columns: ['followee_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      crawls: {
        Row: {
          id: string;
          creator_id: string;
          name: string;
          description: string | null;
          is_public: boolean;
          created_at: string;
        };
        Insert: {
          creator_id: string;
          name: string;
          description?: string | null;
          is_public?: boolean;
        };
        Update: { name?: string; description?: string | null; is_public?: boolean };
        Relationships: [
          {
            foreignKeyName: 'crawls_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      crawl_stops: {
        Row: { id: string; crawl_id: string; bar_id: string; stop_order: number };
        Insert: { crawl_id: string; bar_id: string; stop_order: number };
        Update: { stop_order?: number };
        Relationships: [
          {
            foreignKeyName: 'crawl_stops_crawl_id_fkey';
            columns: ['crawl_id'];
            isOneToOne: false;
            referencedRelation: 'crawls';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'crawl_stops_bar_id_fkey';
            columns: ['bar_id'];
            isOneToOne: false;
            referencedRelation: 'bars';
            referencedColumns: ['id'];
          },
        ];
      };
      feed_posts: {
        Row: { id: string; trip_id: string; user_id: string; caption: string | null; created_at: string };
        Insert: { trip_id: string; user_id: string; caption?: string | null };
        Update: { caption?: string | null };
        Relationships: [
          {
            foreignKeyName: 'feed_posts_trip_id_fkey';
            columns: ['trip_id'];
            isOneToOne: false;
            referencedRelation: 'trips';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'feed_posts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      post_likes: {
        Row: { post_id: string; user_id: string; created_at: string };
        Insert: { post_id: string; user_id: string };
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'post_likes_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'feed_posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_likes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      post_comments: {
        Row: { id: string; post_id: string; user_id: string; body: string; created_at: string };
        Insert: { post_id: string; user_id: string; body: string };
        Update: never;
        Relationships: [
          {
            foreignKeyName: 'post_comments_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'feed_posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'post_comments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      active_host_trip: {
        Args: Record<string, never>;
        Returns: { companion_id: string; host_name: string | null; trip_id: string }[];
      };
    };
  };
};

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
