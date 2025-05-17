// app/(app)/(public)/register.tsx
import {
  Text,
  Alert,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  View,
  ScrollView,
  Image,
} from "react-native";
import React, { useState } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { Link, useRouter } from "expo-router"; // Import useRouter
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Ionicons } from "@expo/vector-icons";

const signupSchema = z
  .object({
    name: z
      .string()
      .min(1, "Full name is required")
      .min(2, "Name must be at least 2 characters")
      .max(50, "Name is too long"),
    email: z
      .string()
      .min(1, "Email is required")
      .email("Invalid email address"),
    password: z
      .string()
      .min(1, "Password is required")
      .min(6, "Password must be at least 6 characters")
      .max(50, "Password is too long")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number")
      .regex(
        /[^A-Za-z0-9]/,
        "Password must contain at least one special character"
      ),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"], // Apply error to confirmPassword field
  });

type SignupFormData = z.infer<typeof signupSchema>;

const RegisterPage = () => {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { onRegister } = useAuth();
  const router = useRouter(); // For programmatic navigation if needed

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onBlur",
  });

  const onSignUpPress = async (data: SignupFormData) => {
    setLoading(true);
    try {
      await onRegister(data.name, data.email, data.password);
      // Navigation handled by AuthProvider and layouts
    } catch (e: any) {
      Alert.alert(
        "Registration Failed",
        e.message || "Could not create your account. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-slate-50"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 justify-center items-center p-6 md:p-10">
          <View className="w-full max-w-md">
            {/* Optional: Logo */}
            {/* <Image source={require('@/assets/images/logo.png')} className="w-20 h-20 mx-auto mb-6" /> */}

            <Text className="text-4xl font-bold text-slate-800 mb-2 text-center">
              Create Account
            </Text>
            <Text className="text-lg text-slate-600 mb-10 text-center">
              Join us and start your wellness journey.
            </Text>

            {/* Full Name Input */}
            <View className="mb-5">
              <Text className="text-sm font-medium text-slate-700 mb-1 ml-1">
                Full Name
              </Text>
              <Controller
                control={control}
                name="name"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    placeholder="e.g., Alex Smith"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    className={`bg-white border ${
                      errors.name ? "border-red-500" : "border-slate-300"
                    } rounded-xl p-4 text-slate-900 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500`}
                  />
                )}
              />
              {errors.name && (
                <Text className="text-red-500 text-xs mt-1 ml-1">
                  {errors.name.message}
                </Text>
              )}
            </View>

            {/* Email Input */}
            <View className="mb-5">
              <Text className="text-sm font-medium text-slate-700 mb-1 ml-1">
                Email Address
              </Text>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    autoCapitalize="none"
                    placeholder="you@example.com"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    keyboardType="email-address"
                    className={`bg-white border ${
                      errors.email ? "border-red-500" : "border-slate-300"
                    } rounded-xl p-4 text-slate-900 text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500`}
                  />
                )}
              />
              {errors.email && (
                <Text className="text-red-500 text-xs mt-1 ml-1">
                  {errors.email.message}
                </Text>
              )}
            </View>

            {/* Password Input */}
            <View className="mb-5">
              <Text className="text-sm font-medium text-slate-700 mb-1 ml-1">
                Password
              </Text>
              <View
                className={`flex-row items-center bg-white border ${
                  errors.password ? "border-red-500" : "border-slate-300"
                } rounded-xl focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500`}
              >
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      placeholder="Choose a strong password"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      secureTextEntry={!showPassword}
                      className="flex-1 p-4 text-slate-900 text-base"
                    />
                  )}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  className="p-3"
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={24}
                    color="rgb(100 116 139)"
                  />
                </TouchableOpacity>
              </View>
              {errors.password && (
                <Text className="text-red-500 text-xs mt-1 ml-1">
                  {errors.password.message}
                </Text>
              )}
            </View>

            {/* Confirm Password Input */}
            <View className="mb-6">
              <Text className="text-sm font-medium text-slate-700 mb-1 ml-1">
                Confirm Password
              </Text>
              <View
                className={`flex-row items-center bg-white border ${
                  errors.confirmPassword ? "border-red-500" : "border-slate-300"
                } rounded-xl focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500`}
              >
                <Controller
                  control={control}
                  name="confirmPassword"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      placeholder="Re-enter your password"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      secureTextEntry={!showConfirmPassword}
                      className="flex-1 p-4 text-slate-900 text-base"
                    />
                  )}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="p-3"
                >
                  <Ionicons
                    name={
                      showConfirmPassword ? "eye-off-outline" : "eye-outline"
                    }
                    size={24}
                    color="rgb(100 116 139)"
                  />
                </TouchableOpacity>
              </View>
              {errors.confirmPassword && (
                <Text className="text-red-500 text-xs mt-1 ml-1">
                  {errors.confirmPassword.message}
                </Text>
              )}
            </View>

            <TouchableOpacity
              onPress={handleSubmit(onSignUpPress)}
              disabled={loading || !isValid}
              className={`bg-blue-600 rounded-xl py-4 items-center transition-opacity ${
                loading || !isValid
                  ? "opacity-60"
                  : "opacity-100 hover:bg-blue-700"
              }`}
            >
              {loading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-white font-semibold text-lg">
                  Create Account
                </Text>
              )}
            </TouchableOpacity>

            <View className="flex-row justify-center mt-8">
              <Text className="text-slate-600">Already have an account? </Text>
              <Link href="/login" asChild>
                <TouchableOpacity>
                  <Text className="text-blue-600 font-semibold hover:underline">
                    Sign In
                  </Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default RegisterPage;
