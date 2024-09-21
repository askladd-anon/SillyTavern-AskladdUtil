// The main script for the extension
// The following are examples of some basic extension functionality

// You'll likely need to import some other functions from the main script
import {
    appendMediaToMessage,
    event_types,
    eventSource,
    Generate,
    generateQuietPrompt,
    getCurrentChatId,
    getRequestHeaders,
    saveChatConditional,
    saveSettings,
    saveSettingsDebounced,
    substituteParamsExtended,
    system_avatar,
    system_message_types,
    this_chid
} from "../../../../script.js";
import { extension_settings, getContext } from '../../../extensions.js';
import { selected_group } from '../../../group-chats.js';
import {
    getMessageTimeStamp,
    humanizedDateTime
} from '../../../RossAscends-mods.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import {
    ARGUMENT_TYPE,
    SlashCommandArgument,
    SlashCommandNamedArgument
} from '../../../slash-commands/SlashCommandArgument.js';
import {
    SlashCommandParser
} from '../../../slash-commands/SlashCommandParser.js';
import {
    getPreset,
    selectPreset,
    textgenerationwebui_preset_names
} from '../../../textgen-settings.js';
import {
    getCharaFilename,
    isTrueBoolean,
    resetScrollHeight,
    saveBase64AsFile
} from '../../../utils.js';

import { Popup } from '../../../popup.js';

// Keep track of where your extension is located, name should match repo name
const extensionName = "SillyTavern-AskladdUtil";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
let askladdExtensionSettings = extension_settings[extensionName];
let latestImpersonateInput = "";
const defaultSettings = {
    comfy_url: 'http://127.0.0.1:8188',
    modular_comfy_workflow: 'Default_Comfy_Workflow.json',
    preset_name: "Deterministic",
    quick_impersonate_prompt: "",
};

async function validateComfyUrl() {
    try {
        if (!askladdExtensionSettings.comfy_url) {
            throw new Error('URL is not set.');
        }

        const result = await fetch('/api/sd/comfy/ping', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                url: askladdExtensionSettings.comfy_url,
            }),
        });
        if (!result.ok) {
            throw new Error('ComfyUI returned an error.');
        }

        await loadComfyWorkflows();
        toastr.success('ComfyUI API connected.');
    } catch (error) {
        toastr.error(`Could not validate ComfyUI API: ${error.message}`);
    }
}

async function loadComfyWorkflows() {
    if (!askladdExtensionSettings.comfy_url) {
        return;
    }

    try {
        $('#pov_modular_comfy_workflow').empty();
        const result =
            await fetch('/api/sd/comfy/workflows',
                { method: 'POST', headers: getRequestHeaders() });
        if (!result.ok) {
            throw new Error('ComfyUI returned an error.');
        }
        const workflows = await result.json();
        for (const workflow of workflows) {
            const option = document.createElement('option');
            option.innerText = workflow;
            option.value = workflow;
            option.selected = workflow === askladdExtensionSettings.modular_comfy_workflow;
            $('#pov_modular_comfy_workflow').append(option);
        }
    } catch (error) {
        return;
    }
}

function loadPovPresets() {
    try {
        $("#pov_sampler_preset").empty();
        for (const preset_name of textgenerationwebui_preset_names) {
            const option = document.createElement('option');
            option.innerText = preset_name;
            option.value = preset_name;
            option.selected = preset_name === askladdExtensionSettings.preset_name;
            $('#pov_sampler_preset').append(option);
        }
    } catch (error) {
        return;
    }
}

function onComfyUrlInput() {
    askladdExtensionSettings.comfy_url = $('#pov_comfy_url').val();
    saveSettingsDebounced();
}

function loadSettings() {
    // Create the settings if they don't exist
    askladdExtensionSettings = askladdExtensionSettings || {};
    if (Object.keys(askladdExtensionSettings).length === 0) {
        Object.assign(askladdExtensionSettings, defaultSettings);
    }

    if (askladdExtensionSettings.character_extra_positive_prompts === undefined) {
        askladdExtensionSettings.character_extra_positive_prompts = {};
    }
    if (askladdExtensionSettings.character_people_ids === undefined) {
        askladdExtensionSettings.character_people_ids = {};
    }
    if (askladdExtensionSettings.character_negative_prompts === undefined) {
        askladdExtensionSettings.character_negative_prompts = {};
    }

    $('#pov_comfy_url').val(askladdExtensionSettings.comfy_url);
    $('#quick_impersonate_prompt').val(askladdExtensionSettings.quick_impersonate_prompt);
    loadComfyWorkflows();
    loadPovPresets();
}

async function generateComfyImage(prompt) {

    const workflowResponse = await fetch('/api/sd/comfy/workflow', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            file_name: askladdExtensionSettings.modular_comfy_workflow,
        }),
    });
    if (!workflowResponse.ok) {
        const text = await workflowResponse.text();
        toastr.error(`Failed to load workflow.\n\n${text}`);
    }
    let workflow = (await workflowResponse.json())
        .replaceAll('"%prompt%"', JSON.stringify(prompt));
    const seed = Math.round(Math.random() * Number.MAX_SAFE_INTEGER);
    workflow = workflow.replaceAll('"%seed%"', JSON.stringify(12345678));

    console.log(`{
        "prompt": ${workflow}
    }`);
    const promptResult = await fetch('/api/sd/comfy/generate', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            url: askladdExtensionSettings.comfy_url,
            prompt: `{
                "prompt": ${workflow}
            }`,
        }),
    });
    if (!promptResult.ok) {
        const text = await promptResult.text();
        throw new Error(text);
    }
    return { format: 'png', data: await promptResult.text() };
}

async function generateComfyImageModular(
    people_id, primary_act_prompt, female_posture_prompt,
    female_hand_act_prompt, male_hand_act_prompt, extra_prompt, outfit_prompt,
    description_prompt, negative_prompt) {

    const workflowResponse = await fetch('/api/sd/comfy/workflow', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            file_name: askladdExtensionSettings.modular_comfy_workflow,
        }),
    });
    if (!workflowResponse.ok) {
        const text = await workflowResponse.text();
        toastr.error(`Failed to load workflow.\n\n${text}`);
    }
    let workflow =
        (await workflowResponse.json())
            .replaceAll('"%people_id%"', JSON.stringify(people_id))
            .replaceAll('"%primary_act_prompt%"',
                JSON.stringify(primary_act_prompt))
            .replaceAll('"%female_posture_prompt%"',
                JSON.stringify(female_posture_prompt))
            .replaceAll('"%female_hand_act_prompt%"',
                JSON.stringify(female_hand_act_prompt))
            .replaceAll('"%male_hand_act_prompt%"',
                JSON.stringify(male_hand_act_prompt))
            .replaceAll('"%extra_prompt%"', JSON.stringify(extra_prompt))
            .replaceAll('"%outfit_prompt%"', JSON.stringify(outfit_prompt))
            .replaceAll('"%description_prompt%"',
                JSON.stringify(description_prompt))
            .replaceAll('"%negative_prompt%"', JSON.stringify(negative_prompt));
    const seed = Math.round(Math.random() * Number.MAX_SAFE_INTEGER);
    workflow = workflow.replaceAll('"%seed%"', JSON.stringify(seed));

    console.log(`{
        "prompt": ${workflow}
    }`);
    const promptResult = await fetch('/api/sd/comfy/generate', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            url: askladdExtensionSettings.comfy_url,
            prompt: `{
                "prompt": ${workflow}
            }`,
        }),
    });
    if (!promptResult.ok) {
        const text = await promptResult.text();
        throw new Error(text);
    }
    return { format: 'png', data: await promptResult.text() };
}

async function sendMessage(quiet, messageText, prompt, image) {
    const context = getContext();
    const message = {
        name: "Narrator",
        is_user: false,
        is_system: quiet,
        send_date: getMessageTimeStamp(),
        mes: quiet ? '' : messageText,
        force_avatar: system_avatar,
        extra: {
            image: image,
            title: prompt,
            inline_image: true,
            image_swipes: [image],
            type: system_message_types.NARRATOR,
            gen_id: Date.now(),
            isSmallSys: false,
        },
    };
    context.chat.push(message);
    const messageId = context.chat.length - 1;
    await eventSource.emit(event_types.MESSAGE_SENT, messageId);
    context.addOneMessage(message);
    await eventSource.emit(event_types.USER_MESSAGE_RENDERED, messageId);
    await saveChatConditional();
}

async function povJson(args, json_string) {
    const context = getContext();
    const characterName =
        context.groupId ? context
            .groups[Object.keys(context.groups)
                .filter(x => context.groups[x].id ===
                    context.groupId)[0]]
            ?.id?.toString()
            : context.characters[context.characterId]?.name;

    let image_gen_json = JSON.parse(json_string);
    console.log("Image gen Json: ");
    console.log(image_gen_json);
    let people_id = getPeopleId();
    let primary_act_prompt = image_gen_json["primary_act_tag"];
    let female_posture_prompt = image_gen_json["female_posture_tag"];
    let female_hand_act_prompt =
        image_gen_json["female_hands_and_arms_gesture_tag"];
    let male_hand_act_prompt = image_gen_json["male_hand_action_tag"];
    let extra_tags = [getExtraPositivePrompt()];
    extra_tags.push(...image_gen_json["facial_expression_tags"]);
    extra_tags.push(...image_gen_json["danbooru_tags"]);
    extra_tags.push(...image_gen_json["clothing_tags"]);
    let location_prompt = image_gen_json["location"];
    extra_tags.push(location_prompt);
    let extra_prompt = extra_tags.join(",");
    if (args?.extra) {
        extra_prompt += ("," + args?.extra);
    }
    console.log("Extra prompt: " + extra_prompt);
    let negative_prompt = getNegativePrompt();

    let result = { format: '', data: '' };
    try {
        let user_name = context.name1;
        let viewer_description =
            "(" +
            image_gen_json["description"]
                .replaceAll(user_name, "a man")
                .replaceAll(user_name.toLowerCase(), "a man")
                .replaceAll(characterName, "a woman") +
            ":1.0)";
        console.log("Viewer description : " + viewer_description);
        result = await generateComfyImageModular(
            people_id, primary_act_prompt, female_posture_prompt,
            female_hand_act_prompt, male_hand_act_prompt, extra_prompt,
            image_gen_json["outfit"], viewer_description, negative_prompt);
        if (!result.data) {
            throw new Error('Endpoint did not return image data.');
        }
    } catch (err) {
        console.error(err);
        toastr.error('Image generation failed. Please try again.' +
            '\n\n' + String(err),
            'Image Generation');
        return;
    }

    const currentChatId = getCurrentChatId();
    if (currentChatId !== getCurrentChatId()) {
        console.warn('Chat changed, aborting SD result saving');
        toastr.warning('Chat changed, generated image discarded.',
            'Image Generation');
        return;
    }

    const filename = `${characterName}_${humanizedDateTime()}`;
    const base64Image = await saveBase64AsFile(result.data, characterName,
        filename, result.format);
    let quiet = (isTrueBoolean(args?.quiet));
    sendMessage(quiet, image_gen_json["description"], json_string, base64Image);
    await context.saveChat();
    return base64Image;
}


function remove_colon(str) {
    let colon_index = str.indexOf(":")
    if (colon_index === -1) {
        return str;
    }
    else {
        return str.slice(colon_index + 1);
    }
}

function getCharacterName() {
    const context = getContext();
    const characterName =
        context.groupId ? context
            .groups[Object.keys(context.groups)
                .filter(x => context.groups[x].id ===
                    context.groupId)[0]]
            ?.id?.toString()
            : context.characters[context.characterId]?.name;
    return characterName;
}

/**
 * Sanitizes generated prompt for image generation.
 * @param {string} str String to process
 * @returns {string} Processed reply
 */
function processReply(str) {
    if (!str) {
        return '';
    }

    const characterName = getCharacterName();

    str = str.replaceAll('"', '');
    str = str.replaceAll('“', '');
    str = str.replaceAll('.', ',');
    str = str.replaceAll('\n', ', ');
    str = str.replaceAll(' - ', ' ');
    str = str.replaceAll('- ', ' ');
    str = str.replaceAll('(', ' ');
    str = str.replaceAll(')', ' ');
    str = str.replaceAll(characterName + "'s ", "another's ");
    str = str.normalize('NFD');
    str = str.replace(/[^a-zA-Z0-9,:_(){}<>[\]\-']+/g, ' ');
    str = str.replace(/\s+/g, ' '); // Collapse multiple whitespaces into one
    str = str.trim();

    str = str.toLowerCase()
        .split(',')         // list split by commas
        .map(x => x.trim()) // trim each entry
        .map(x => remove_colon(x))
        .filter(x => x) // remove empty entries
        .filter(x => !x.includes("doing nothing"))
        .filter(x => !x.includes("no relevant sexual act"))
        .join(', '); // join it back with proper spacing

    return str;
}

function getCharacterPromptPrefix() {
    if (!this_chid || selected_group) {
        return '';
    }

    const key = getCharaFilename(this_chid);

    if (key) {
        return askladdExtensionSettings.character_prompts[key] || '';
    }

    return '';
}

function getPeopleId() {
    if (!this_chid || selected_group) {
        return '';
    }

    const key = getCharaFilename(this_chid);

    if (key) {
        return askladdExtensionSettings.character_people_ids[key] || '';
    }

    return '';
}

function getExtraPositivePrompt() {
    if (!this_chid || selected_group) {
        return '';
    }

    const key = getCharaFilename(this_chid);

    if (key) {
        return askladdExtensionSettings.character_extra_positive_prompts[key] || '';
    }

    return '';
}

function getNegativePrompt() {
    if (!this_chid || selected_group) {
        return '';
    }

    const key = getCharaFilename(this_chid);

    if (key) {
        return askladdExtensionSettings.character_negative_prompts[key] || '';
    }

    return '';
}

async function generateImagePrompt(quietPrompt) {
    const reply = await generateQuietPrompt(quietPrompt, false, false);
    const processedReply = processReply(reply);

    if (!processedReply) {
        toastr.error(
            'Prompt generation produced no text. Make sure you\'re using a valid instruct template and try again',
            'Image Generation');
        throw new Error('Prompt generation failed.');
    }

    return processedReply;
}

async function generatePicture(genType) {
    const context = getContext();

    let quietPrompt = askladdExtensionSettings.prompts[genType];

    const characterName =
        context.groupId ? context
            .groups[Object.keys(context.groups)
                .filter(x => context.groups[x].id ===
                    context.groupId)[0]]
            ?.id?.toString()
            : context.characters[context.characterId]?.name;

    let result = { format: '', data: '' };

    let textGenPreset = getPreset();
    await selectPreset(askladdExtensionSettings.preset_name);

    let imagePrompt = getCharacterPromptPrefix() + ", " +
        generationPrefixes[genType] + ", " +
        await generateImagePrompt(quietPrompt);
    console.log("initial image prompt: " + imagePrompt);
    if (genType === generationMode.POV) {
        let redirectGenType = generationMode.POV;
        const armpit_focus_substrings =
            ["sniffing armpit", "licking armpit", "sucking armpit"];
        for (const armpit_focus_substring of armpit_focus_substrings) {
            if (imagePrompt.includes(armpit_focus_substring)) {
                redirectGenType = generationMode.ARMPIT_FOCUS;
            }
        }
        const anus_focus_substrings =
            ["sniffing anus", "licking anus", "sucking anus"];
        for (const anus_focus_substring of anus_focus_substrings) {
            if (imagePrompt.includes(anus_focus_substring)) {
                redirectGenType = generationMode.ANUS_FOCUS;
            }
        }
        const breast_focus_substrings = [
            "sniffing breasts", "licking nipple", "licking breasts", "sucking nipple",
            "sucking breasts", "pressing breasts against face"
        ];
        for (const breast_focus_substring of breast_focus_substrings) {
            if (imagePrompt.includes(breast_focus_substring)) {
                redirectGenType = generationMode.BREAST_FOCUS;
            }
        }
        const pussy_focus_substrings = ["sniffing pussy", "licking pussy"];
        for (const pussy_focus_substring of pussy_focus_substrings) {
            if (imagePrompt.includes(pussy_focus_substring)) {
                redirectGenType = generationMode.PUSSY_FOCUS;
            }
        }
        if (redirectGenType !== generationMode.POV) {
            quietPrompt = askladdExtensionSettings.prompts[redirectGenType];
            imagePrompt = getCharacterPromptPrefix() + ", " +
                generationPrefixes[redirectGenType] + ", " +
                await generateImagePrompt(quietPrompt);
        } else {
            quietPrompt = askladdExtensionSettings.prompts[generationMode.EXTRA];
            if (quietPrompt !== "") {
                imagePrompt =
                    imagePrompt + ", " + await generateImagePrompt(quietPrompt);
            }
        }
    }
    console.log("final image prompt: " + imagePrompt);

    selectPreset(textGenPreset);

    const currentChatId = getCurrentChatId();

    try {
        result = await generateComfyImage(imagePrompt);
        if (!result.data) {
            throw new Error('Endpoint did not return image data.');
        }
    } catch (err) {
        console.error(err);
        toastr.error('Image generation failed. Please try again.' +
            '\n\n' + String(err),
            'Image Generation');
        return;
    }

    if (currentChatId !== getCurrentChatId()) {
        console.warn('Chat changed, aborting SD result saving');
        toastr.warning('Chat changed, generated image discarded.',
            'Image Generation');
        return;
    }

    const filename = `${characterName}_${humanizedDateTime()}`;
    const base64Image = await saveBase64AsFile(result.data, characterName,
        filename, result.format);
    sendMessage(imagePrompt, base64Image);
    return base64Image;
}

function onComfyWorkflowChange() {
    askladdExtensionSettings.modular_comfy_workflow =
        $('#pov_modular_comfy_workflow').find(':selected').val();
    console.log("Modular Comfy Workflow: ", askladdExtensionSettings.modular_comfy_workflow);
    saveSettings();
}

function onSamplerPresetChange() {
    askladdExtensionSettings.preset_name =
        $("#pov_sampler_preset").find(':selected').val();
    saveSettingsDebounced();
}

function onChatChanged() {
    if (this_chid === undefined || selected_group) {
        $('#pov_character_prompt_block').hide();
        return;
    }

    $('#pov_character_prompt_block').show();

    const key = getCharaFilename(this_chid);
    let characterExtraPositivePrompt =
        key ? (askladdExtensionSettings.character_extra_positive_prompts[key] || '')
            : '';
    let characterPeopleId =
        key ? (askladdExtensionSettings.character_people_ids[key] || '') : '';
    let characterNegativePrompt =
        key ? (askladdExtensionSettings.character_negative_prompts[key] || '') : '';

    $('#pov_people_id').val(characterPeopleId);
    $('#pov_extra_positive_prompt').val(characterExtraPositivePrompt);
    $('#pov_negative_prompt').val(characterNegativePrompt);
    adjustElementScrollHeight();
}

async function adjustElementScrollHeight() {
    if (!$('.pov_settings').is(':visible')) {
        return;
    }

    await resetScrollHeight($('#pov_character_prompt'));
}

async function onPeopleIdInput() {
    const key = getCharaFilename(this_chid);
    askladdExtensionSettings.character_people_ids[key] = $('#pov_people_id').val();
    await resetScrollHeight($(this));
    saveSettingsDebounced();
}

async function onExtraPositivePromptInput() {
    const key = getCharaFilename(this_chid);
    askladdExtensionSettings.character_extra_positive_prompts[key] =
        $('#pov_extra_positive_prompt').val();
    await resetScrollHeight($(this));
    saveSettingsDebounced();
}

async function onNegativePromptInput() {
    const key = getCharaFilename(this_chid);
    askladdExtensionSettings.character_negative_prompts[key] =
        $('#pov_negative_prompt').val();
    await resetScrollHeight($(this));
    saveSettingsDebounced();
}

async function onQuickImpersonatePromptInput() {
    askladdExtensionSettings.quick_impersonate_prompt = $('#quick_impersonate_prompt').val();
    await resetScrollHeight($(this));
    saveSettingsDebounced();
}

async function impersonate(prompt) {
    const options = prompt?.trim() ? { quiet_prompt: prompt.trim().replaceAll("{{input}}", latestImpersonateInput), quietToLoud: true } : {};
    const shouldAwait = true;
    const outerPromise = new Promise((outerResolve) => setTimeout(async () => {
        // Prevent generate recursion
        $('#send_textarea').val('')[0].dispatchEvent(new Event('input', { bubbles: true }));

        outerResolve(new Promise(innerResolve => setTimeout(() => innerResolve(Generate('impersonate', options)), 1)));
    }, 1));

    if (shouldAwait) {
        const innerPromise = await outerPromise;
        await innerPromise;
    }

    return '';
}

const sendTextArea = document.querySelector('#send_textarea');
async function processHotkeys(event) {
    // Default hotkeys and shortcuts shouldn't work if any popup is currently open
    if (Popup.util.isPopupOpen()) {
        return;
    }

    //Enter to send when send_textarea in focus
    if (document.activeElement == sendTextArea) {
        if (event.ctrlKey && event.altKey) {
            if (event.key == 'd') {
                event.preventDefault();
                latestImpersonateInput = $("#send_textarea").val();
                impersonate(askladdExtensionSettings.quick_impersonate_prompt);
                return;
            }
            else if (event.key == 'r') {
                impersonate(askladdExtensionSettings.quick_impersonate_prompt);
                return;
            }
        }
    }
}

jQuery(async () => {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $("#extensions_settings").append(settingsHtml);
    loadSettings();


    $('#pov_comfy_url').on('input', onComfyUrlInput);
    $('#pov_comfy_validate').on('click', validateComfyUrl);
    $('#pov_modular_comfy_workflow').on('change', onComfyWorkflowChange);
    $('#pov_sampler_preset').on('change', onSamplerPresetChange);
    $('#pov_people_id').on('input', onPeopleIdInput);
    $('#pov_extra_positive_prompt').on('input', onExtraPositivePromptInput);
    $('#pov_negative_prompt').on('input', onNegativePromptInput);
    $('#quick_impersonate_prompt').on('input', onQuickImpersonatePromptInput);
    $(document).on('keydown', async function (event) {
        await processHotkeys(event.originalEvent);
    });
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: "pov_json",
        callback: (args, jsonString) => povJson(args, jsonString),
        namedArgumentList: [
            new SlashCommandNamedArgument(
                'quiet',
                'whether to post the generated image to chat',
                [ARGUMENT_TYPE.BOOLEAN],
                false,
                false,
                'false',
            ),
            SlashCommandNamedArgument.fromProps({
                name: 'extra',
                description: 'extra prompt prefix',
                typeList: [ARGUMENT_TYPE.STRING],
            }),
        ],
        unnamedArgumentList: [
            new SlashCommandArgument('json', [ARGUMENT_TYPE.STRING], true, false,
                "{}"),
        ],
        helpString: 'generate from json',
    }))

});
