import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useState } from "react";
import {
  useAppointments,
  ConsultationStatus,
} from "@/providers/AppointmentProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter } from "expo-router";
import DateTimePickerModal from "react-native-modal-datetime-picker";

const Page = () => {
  const { makeAppointment } = useAppointments();
  const { authState } = useAuth();
  const [therapistId, setTherapistId] = useState("41m3lxk");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    try {
      if (!therapistId) {
        Alert.alert("Error", "Please enter a therapist ID");
        return;
      }

      await makeAppointment({
        clientId: authState?.user_id || "",
        therapistId,
        dateTime: date.toISOString(),
        status: ConsultationStatus.Pending,
        notes,
      });

      Alert.alert("Success", "Appointment scheduled successfully");
      router.back();
    } catch (error) {
      Alert.alert("Error", "Failed to schedule appointment");
      console.log(error);
    }
  };

  const handleConfirm = (selectedDate: Date) => {
    setShowDatePicker(false);
    setDate(selectedDate);
  };

  const handleCancel = () => {
    setShowDatePicker(false);
  };

  return (
    <ScrollView className="flex-1 bg-white p-4">
      <View className="gap-6">
        <Text className="text-2xl font-bold text-gray-800">
          Schedule Consultation
        </Text>

        <View className="gap-2">
          <Text className="text-gray-600 font-medium">Therapist ID</Text>
          <TextInput
            className="border border-gray-300 rounded-lg p-3 bg-gray-50"
            value={therapistId}
            onChangeText={setTherapistId}
            placeholder="Enter therapist ID"
          />
        </View>

        <View className="gap-2">
          <Text className="text-gray-600 font-medium">Date and Time</Text>
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            className="border border-gray-300 rounded-lg p-3 bg-gray-50"
          >
            <Text>{date.toLocaleString()}</Text>
          </TouchableOpacity>

          <DateTimePickerModal
            isVisible={showDatePicker}
            mode="datetime"
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            date={date}
          />
        </View>

        <View className="gap-2">
          <Text className="text-gray-600 font-medium">Notes (Optional)</Text>
          <TextInput
            className="border border-gray-300 rounded-lg p-3 bg-gray-50"
            value={notes}
            onChangeText={setNotes}
            placeholder="Add any notes"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          onPress={handleSubmit}
          className="bg-blue-500 rounded-lg p-4 items-center"
        >
          <Text className="text-white font-medium text-lg">
            Schedule Appointment
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default Page;
